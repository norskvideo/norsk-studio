import { ComposePart, FileImageInputNode, Norsk, SubscribeDestination, SubscriptionError, VideoComposeNode, videoToPin } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { errorlog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { Router } from 'express';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';


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

export default class DynamicBugDefinition implements ServerComponentDefinition<DynamicBugConfig, DynamicBug, DynamicBugState, DynamicBugCommand, DynamicBugEvent> {
  async create(norsk: Norsk, cfg: DynamicBugConfig, cb: OnCreated<DynamicBug>, runtime: StudioRuntime<DynamicBugState, DynamicBugEvent>) {
    const node = await DynamicBug.create(norsk, cfg, runtime.updates);
    cb(node);
  }

  routes(): Router {
    const router = express.Router()

    router.get("/bugs", async (_req, res) => {
      const files = await fs.readdir(bugDir());
      const images = files.filter((f) => {
        return f.endsWith(".png") || f.endsWith(".jpg");
      })
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
    this.id = cfg.id;
    this.norsk = norsk;
    this.initialised = this.initialise();
    this.updates = updates;
  }

  async sourceContextChange(_responseCallback: (error?: SubscriptionError | undefined) => void): Promise<boolean> {
    // If things change upstream, so so be it (for now)
    if (this.composeNode) return false;
    if (!this.videoSource) {
      errorlog("Context received by node, but no video source is presently active", { id: this.id });
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

    this.composeNode = await this.norsk.processor.transform.videoCompose<'video' | 'bug'>({
      id: `${this.id}-compose`,
      referenceStream: 'video',
      referenceResolution: { width: 100, height: 100 },

      // Could accept quadra, but there is pending work on quadra compose
      // which means that non-fullscreen overlays have a few outstanding issues
      hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["nvidia"]),
      outputResolution: {
        width: videoStream.metadata.message.value.width,
        height: videoStream.metadata.message.value.height
      },
      parts: [this.videoPart()]
    });
    this.composeNode.subscribeToPins(this.videoSource.selectVideoToPin("video"))
    this.relatedMediaNodes.addOutput(this.composeNode);
    this.relatedMediaNodes.addInput(this.composeNode);
    void this.setupBug(this.cfg.defaultBug, this.cfg.defaultOrientation);
    return false;
  }

  async setupBug(bug?: string, orientation?: DynamicBugOrientation) {
    if (!bug) {
      this.composeNode?.subscribeToPins(this.videoSource?.selectVideoToPin("video") || [])
      this.updates.raiseEvent({ type: 'bug-changed' })
      return;
    }

    // We could be clever here and do a clean switch with A and B and double buffering
    // but the side effect of not doing this, is to have a few frames without a bug, is that okay? probably
    if (this.imageSource) {
      await this.imageSource.close();
    }

    this.imageSource = await this.norsk.input.fileImage({
      sourceName: `${this.id}-bug`,
      fileName: path.join(bugDir(), bug)
    })

    this.composeNode?.updateConfig({
      parts: [
        this.videoPart(),
        this.imagePart(orientation ?? 'topleft')
      ]
    })

    this.composeNode?.subscribeToPins((this.videoSource?.selectVideoToPin<"video" | "bug">("video") ?? []).concat([
      { source: this.imageSource, sourceSelector: videoToPin("bug") }
    ]))
    this.updates.raiseEvent({ type: 'bug-changed', file: bug, orientation })
  }

  imagePart(orientation: DynamicBugOrientation): ComposePart<"bug"> {
    return {
      id: "bug",
      zIndex: 1,
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },

      // What to do about resolution?
      // we could subscribe to the output of the image source and do some maths
      // to preserve aspect ratio before building this config?
      destRect: (orientation == 'topleft' ? { x: 0.1, y: 0.1, width: 5.0, height: 5.0 } :
        orientation == 'topright' ? { x: 94.9, y: 0.1, width: 5.0, height: 5.0 } :
          orientation == 'bottomleft' ? { x: 0.1, y: 94.9, width: 5.0, height: 5.0 } :
            { x: 94.9, y: 94.9, width: 5.0, height: 5.0 }),
      opacity: 1.0,
      pin: "bug"
    }
  }

  videoPart(): ComposePart<"video"> {
    return {
      id: "video",
      zIndex: 0,
      sourceRect: { x: 0, y: 0, width: 100, height: 100 },
      destRect: { x: 0, y: 0, width: 100, height: 100 },
      opacity: 1.0,
      pin: "video"
    }
  }

  async initialise() {
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    this.videoSource = sources[0];
    this.videoSource.registerForContextChange(this);
  }
}

