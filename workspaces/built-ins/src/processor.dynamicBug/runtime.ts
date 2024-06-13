import { ComposePart, FileImageInputNode, Norsk, SubscribeDestination, SubscriptionError, VideoComposeNode, videoToPin } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { errorlog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';

import bodyParser from 'body-parser';
import express from 'express'
import multer from 'multer';

export type DynamicBugOrientation = "topleft" | "topright" | "bottomleft" | "bottomright";

export type DynamicBugConfig = {
  __global: {
    hardware?: HardwareAccelerationType,
    dataDir?: string
  },
  id: string,
  displayName: string,
  defaultBug?: string
  defaultOrientation?: DynamicBugOrientation;
  apiPort: number;
}

export type DynamicBugState = {
  activeBug?: {
    file?: string,
    orientation?: DynamicBugOrientation
  },
}

export type DynamicBugCommand = {
  type: 'change-bug',
  file?: string,
  orientation?: DynamicBugOrientation
}

export type DynamicBugEvent = {
  type: 'bug-changed',
  file?: string,
  orientation?: DynamicBugOrientation
}

// Norsk Studio itself really needs the concept of a 'data dir'
// and I'm wondering if we need the ability to tie requests to the 'active session' if there is one
// for now we'll just use a hard coded env
// We might be able to just throw  the sessionid into /bugs, and have the client code aware of it
// and provide a means for this code to reach out into ActiveSession and retrieve it
// but anyway, an env var is fine for now
function bugDir() {
  return path.resolve(process.env.NORSK_DATA_DIR || "data/bugs");
}

async function getBugs() {
  const files = await fs.readdir(bugDir());
  const images = files.filter((f) => {
    return f.endsWith(".png") || f.endsWith(".jpg");
  })
  return images;
}


export default class DynamicBugDefinition implements ServerComponentDefinition<DynamicBugConfig, DynamicBug, DynamicBugState, DynamicBugCommand, DynamicBugEvent> {
  async create(norsk: Norsk, cfg: DynamicBugConfig, cb: OnCreated<DynamicBug>, runtime: StudioRuntime<DynamicBugState, DynamicBugEvent>) {
    const node = await DynamicBug.create(norsk, cfg, runtime.updates);
    cb(node);

    // Really I'd like to hijack the Norsk Studio express here in some way, shape, or form
    // but that's going to require some thought
    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(cors());

    expressApp.get("/active-bug", async (_req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify({
        bug: node.bug,
        orientation: node.orientation
      }));
    })
    expressApp.post("/active-bug", async (req, res) => {
      if (!["topleft", "topright", "bottomleft", "bottomright"].includes(req.body.orientation)) {
        res.writeHead(400);
        res.end("bad orientation");
        return;
      }
      const images = await getBugs();
      if (!images.includes(req.body.bug)) {
        res.writeHead(400);
        res.end("bad bug");
        return;
      }
      await node.setupBug(req.body.bug, req.body.orientation);
      res.writeHead(200);
      res.end("ok");
    })
    const storage = multer.diskStorage({
      destination: bugDir(),
      filename: function(_req, file, cb) {
        cb(null, path.basename(file.originalname));
      }
    });
    const upload = multer({ storage })
    expressApp.post('/bugs', upload.single('file'), (_req, res) => {
      res.send('File uploaded successfully')
    })
    expressApp.get("/bugs", cors({
      origin: '*',
      optionsSuccessStatus: 200
    }), async (_req, res) => {
      const images = await getBugs();
      res.writeHead(200);
      res.end(JSON.stringify(images));
    })

    expressApp.listen(cfg.apiPort);
  }

  routes(): Router {
    const router = express.Router()
    router.use(bodyParser.json());

    router.get("/bugs", async (_req, res) => {
      const images = await getBugs();
      res.writeHead(200);
      res.end(JSON.stringify(images));
    })
    return router;
  }

  async handleCommand(node: DynamicBug, command: DynamicBugCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'change-bug':
        await node.setupBug(command.file, command.orientation);
        break;
      default:
        assertUnreachable(commandType);

    }
  }
}


export class DynamicBug implements CreatedMediaNode, SubscribeDestination {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();
  norsk: Norsk;
  cfg: DynamicBugConfig;
  bug?: string;
  orientation?: DynamicBugOrientation;

  videoSource?: StudioNodeSubscriptionSource;
  composeNode?: VideoComposeNode<"video" | "bug">;
  imageSource?: FileImageInputNode;
  initialised: Promise<void>;
  updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>;

  static async create(norsk: Norsk, cfg: DynamicBugConfig, updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>) {
    const node = new DynamicBug(norsk, cfg, updates);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: DynamicBugConfig, updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>) {
    this.cfg = cfg;
    this.bug = cfg.defaultBug;
    this.orientation = cfg.defaultOrientation;
    this.id = cfg.id;
    this.norsk = norsk;
    this.initialised = this.initialise();
    this.updates = updates;
  }

  async sourceContextChange(_responseCallback: (error?: SubscriptionError | undefined) => void): Promise<boolean> {
    if (!this.videoSource) {
      return false;
    }
    const videoStream = this.videoSource.latestStreams()[0];

    if (!videoStream) {
      return false;
    }

    if (videoStream.metadata.message.case !== 'video') {
      errorlog("Media other than video received in dynamicBug node??", { id: this.id, metadata: videoStream.metadata });
      return false;
    }

    // If we haven't got a compose node, then spin one up
    // with the resolution/etc of the incoming stream
    if (!this.composeNode) {
      this.composeNode = await this.norsk.processor.transform.videoCompose<'video' | 'bug'>({
        id: `${this.id}-compose`,
        referenceStream: 'video',
        // Could accept quadra, but there is pending work on quadra compose
        // which means that non-fullscreen overlays have a few outstanding issues
        hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["nvidia"]),
        outputResolution: {
          width: videoStream.metadata.message.value.width,
          height: videoStream.metadata.message.value.height
        },
        parts: [
          this.videoPart(videoStream.metadata.message.value.width, videoStream.metadata.message.value.height),
        ]
      });
      this.composeNode.subscribeToPins(this.videoSource.selectVideoToPin("video"))
      this.relatedMediaNodes.addOutput(this.composeNode);
      this.relatedMediaNodes.addInput(this.composeNode);
    }

    // Re-configure the compose node based on what we have, or don't have
    // from the image source
    if (this.imageSource) {
      const imageStream = this.imageSource.outputStreams[0];
      if (imageStream && imageStream.message.case == 'video') {
        this.composeNode?.updateConfig({
          parts: [
            this.videoPart(videoStream.metadata.message.value.width, videoStream.metadata.message.value.height),
            this.imagePart(this.orientation ?? 'topleft',
              videoStream.metadata.message.value.width,
              videoStream.metadata.message.value.height,
              imageStream.message.value.width,
              imageStream.message.value.height)
          ]
        })

      } else {
        this.composeNode?.updateConfig({
          parts: [
            this.videoPart(videoStream.metadata.message.value.width, videoStream.metadata.message.value.height),
          ]
        })
      }
    }

    // Then update the subs regardless
    this.doSubs();
    return false;
  }

  doSubs() {
    if (!this.imageSource) {
      this.composeNode?.subscribeToPins(this.videoSource?.selectVideoToPin("video") || [])
    } else {
      this.composeNode?.subscribeToPins((this.videoSource?.selectVideoToPin<"video" | "bug">("video") ?? []).concat([
        { source: this.imageSource, sourceSelector: videoToPin("bug") }
      ]))
    }
  }

  async setupBug(bug?: string, orientation?: DynamicBugOrientation) {
    // We could be clever here and do a clean switch with A and B and double buffering
    // but the side effect of not doing this, is to have a few frames without a bug, is that okay? probably
    if (this.imageSource) {
      await this.imageSource.close();
      this.imageSource = undefined;
    }
    if (!bug) {
      this.doSubs();
      this.updates.raiseEvent({ type: 'bug-changed' })
      return;
    }

    this.imageSource = await this.norsk.input.fileImage({
      sourceName: `${this.id}-bug`,
      fileName: path.join(bugDir(), bug)
    })
    this.imageSource.registerForContextChange(this);
    this.bug = bug;
    this.orientation = orientation;
    this.updates.raiseEvent({ type: 'bug-changed', file: bug, orientation })
  }

  imagePart(orientation: DynamicBugOrientation,
    videoWidth: number,
    videoHeight: number,
    imageWidth: number,
    imageHeight: number): ComposePart<"bug"> {

    // We shouldn't need this, pending work on Compose
    imageWidth = Math.min(videoWidth - 100, imageWidth);
    imageHeight = Math.min(videoHeight - 100, imageHeight);

    const foo = {
      id: "bug",
      zIndex: 1,
      sourceRect: { x: 0, y: 0, width: videoWidth, height: videoHeight },
      referenceResolution: undefined,

      // What to do about resolution?
      // we could subscribe to the output of the image source and do some maths
      // to preserve aspect ratio before building this config?
      destRect: (orientation == 'topleft' ? { x: 5, y: 5, width: imageWidth, height: imageHeight } :
        orientation == 'topright' ? { x: videoWidth - imageWidth - 5, y: 5, width: imageWidth, height: imageHeight } :
          orientation == 'bottomleft' ? { x: 5, y: videoHeight - imageHeight - 5, width: imageWidth, height: imageHeight } :
            { x: videoWidth - imageWidth - 5, y: videoHeight - imageHeight - 5, width: imageWidth, height: imageHeight }),
      opacity: 1.0,
      pin: "bug"
    } as const;
    return foo;
  }

  videoPart(videoWidth: number, videoHeight: number): ComposePart<"video"> {
    return {
      id: "video",
      zIndex: 0,
      sourceRect: { x: 0, y: 0, width: videoWidth, height: videoHeight },
      destRect: { x: 0, y: 0, width: videoWidth, height: videoHeight },
      opacity: 1.0,
      pin: "video"
    }
  }

  async initialise() {
    await this.setupBug(this.cfg.defaultBug, this.cfg.defaultOrientation);
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    this.videoSource = sources[0];
    this.videoSource.registerForContextChange(this);
  }
}

