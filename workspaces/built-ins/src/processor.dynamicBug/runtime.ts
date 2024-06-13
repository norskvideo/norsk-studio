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

export type DynamicBugPosition = "topleft" | "topright" | "bottomleft" | "bottomright";

export type DynamicBugConfig = {
  __global: {
    hardware?: HardwareAccelerationType,
    dataDir?: string
  },
  id: string,
  displayName: string,
  defaultBug?: string
  defaultPosition?: DynamicBugPosition;
  apiPort: number;
}

export type DynamicBugState = {
  activeBug?: {
    file?: string,
    position?: DynamicBugPosition
  },
}

export type DynamicBugCommand = {
  type: 'change-bug',
  file?: string,
  position?: DynamicBugPosition
}

export type DynamicBugEvent = {
  type: 'bug-changed',
  file?: string,
  position?: DynamicBugPosition
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
        position: node.position
      }));
    })
    expressApp.post("/active-bug", async (req, res) => {
      if (!["topleft", "topright", "bottomleft", "bottomright"].includes(req.body.position)) {
        res.writeHead(400);
        res.end("bad position");
        return;
      }
      const images = await getBugs();
      if (!images.includes(req.body.bug)) {
        res.writeHead(400);
        res.end("bad bug");
        return;
      }
      await node.setupBug(req.body.bug, req.body.position);
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
        await node.setupBug(command.file, command.position);
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
  position?: DynamicBugPosition;

  videoSource?: StudioNodeSubscriptionSource;
  composeNode?: VideoComposeNode<"video" | "bug">;
  imageSource?: FileImageInputNode;
  oldImageSource?: FileImageInputNode;
  activeImage: "a" | "b" = "a";
  initialised: Promise<void>;
  updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>;

  static async create(norsk: Norsk, cfg: DynamicBugConfig, updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>) {
    const node = new DynamicBug(norsk, cfg, updates);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: DynamicBugConfig, updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
  }

  async sourceContextChange(responseCallback: (error?: SubscriptionError | undefined) => void): Promise<boolean> {
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

    // What we want to do here is
    // If there is *only* an imageSource, then go ahead and use it, parts and all
    // If there are both old and new sources, then use the old source and subscribe to it if the new source hasn't got a stream yet
    // If there are are streams from both sources
    // remove the subscription entirely
    // close the old node and swap them
    // then re-do this whole thing

    // Re-configure the compose node based on what we have, or don't have
    // prefering the new image source if it exists
    if (this.imageSource || this.oldImageSource) {
      const newImageStream = this.imageSource?.outputStreams[0];
      const oldImageStream = this.oldImageSource?.outputStreams[0];
      if (newImageStream && oldImageStream) {
        // Clear the subs
        this.doSubs();

        // Reset the compose node to have no overlay
        this.composeNode?.updateConfig({
          parts: [
            this.videoPart(videoStream.metadata.message.value.width, videoStream.metadata.message.value.height),
          ]
        })
        void this.oldImageSource?.close();
        this.oldImageSource = undefined;
        return await this.sourceContextChange(responseCallback);
      }

      if (newImageStream) {
        this.doSubs(this.imageSource);
      } else if (oldImageStream) {
        this.doSubs(this.oldImageSource);
      }
      const imageStream = newImageStream ?? oldImageStream;
      if (imageStream && imageStream.message.case == 'video') {
        this.composeNode?.updateConfig({
          parts: [
            this.videoPart(videoStream.metadata.message.value.width, videoStream.metadata.message.value.height),
            this.imagePart(this.position ?? 'topleft',
              videoStream.metadata.message.value.width,
              videoStream.metadata.message.value.height,
              imageStream.message.value.width,
              imageStream.message.value.height)
          ]
        })
      } else {
        this.doSubs();
        this.composeNode?.updateConfig({
          parts: [
            this.videoPart(videoStream.metadata.message.value.width, videoStream.metadata.message.value.height),
          ]
        })
      }
    }
    return false;
  }

  doSubs(imageSource?: FileImageInputNode) {
    if (!imageSource) {
      this.composeNode?.subscribeToPins(this.videoSource?.selectVideoToPin("video") || [])
    } else {
      this.composeNode?.subscribeToPins((this.videoSource?.selectVideoToPin<"video" | "bug">("video") ?? []).concat([
        { source: imageSource, sourceSelector: videoToPin("bug") }
      ]))
    }
  }

  async setupBug(bug?: string, position?: DynamicBugPosition) {
    this.position = position;
    if (!bug || bug === "") {
      this.doSubs();
      await this.imageSource?.close();
      this.imageSource = undefined;
      this.bug = undefined;
      this.updates.raiseEvent({ type: 'bug-changed' })
      await this.sourceContextChange(() => { });
      return;
    } else if (bug !== this.bug) {
      this.bug = bug;
      this.activeImage = this.activeImage == "a" ? "b" : "a";
      this.oldImageSource = this.imageSource;
      this.imageSource = await this.norsk.input.fileImage({
        id: `${this.id}-${this.activeImage}`,
        sourceName: `${this.id}-bug-${this.activeImage}`,
        fileName: path.join(bugDir(), bug)
      })
      this.imageSource.registerForContextChange(this);
    }
    await this.sourceContextChange(() => { });
    this.updates.raiseEvent({ type: 'bug-changed', file: bug, position })
  }

  imagePart(position: DynamicBugPosition,
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
      destRect: (position == 'topleft' ? { x: 5, y: 5, width: imageWidth, height: imageHeight } :
        position == 'topright' ? { x: videoWidth - imageWidth - 5, y: 5, width: imageWidth, height: imageHeight } :
          position == 'bottomleft' ? { x: 5, y: videoHeight - imageHeight - 5, width: imageWidth, height: imageHeight } :
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
    await this.setupBug(this.cfg.defaultBug, this.cfg.defaultPosition);
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    this.videoSource = sources[0];
    this.videoSource.registerForContextChange(this);
  }
}

