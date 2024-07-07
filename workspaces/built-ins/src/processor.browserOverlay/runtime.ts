import { BrowserInputNode, Norsk, VideoComposeNode, VideoStreamMetadata, videoToPin } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, OnCreated, RelatedMediaNodes, ServerComponentDefinition, StudioNodeSubscriptionSource } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';

export type BrowserOverlayConfig = {
  __global: {
    hardware?: HardwareAccelerationType
  },
  id: string,
  displayName: string,
  url: string
}

export default class BrowserOverlayDefinition implements ServerComponentDefinition<BrowserOverlayConfig, BrowserOverlay> {
  async create(norsk: Norsk, cfg: BrowserOverlayConfig, cb: OnCreated<BrowserOverlay>) {
    const node = await BrowserOverlay.create(norsk, cfg);
    cb(node);
  }

}



//
// And everything below this line is Norsk
// 

export class BrowserOverlay implements CreatedMediaNode {
  compose?: VideoComposeNode<"video" | "overlay">;
  browser?: BrowserInputNode;
  currentVideo?: VideoStreamMetadata;
  norsk: Norsk;

  control: ContextPromiseControl = new ContextPromiseControl(this.handleContext.bind(this));
  videoSource?: StudioNodeSubscriptionSource;
  cfg: BrowserOverlayConfig;
  initialised: Promise<void>;
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  static async create(norsk: Norsk, cfg: BrowserOverlayConfig) {
    const node = new BrowserOverlay(norsk, cfg);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: BrowserOverlayConfig) {
    this.id = cfg.id;
    this.cfg = cfg;
    this.norsk = norsk;
    this.initialised = this.initialise();
  }

  async initialise() {
    // Nothing to do
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    this.videoSource = sources[0];
    this.control.setSources(sources);
  }

  async handleContext() {
    const video = this.videoSource?.latestStreams()[0]?.metadata;
    if (!video || !this.videoSource || video.message.case !== 'video') {
      await this.compose?.close();
      await this.browser?.close();
      this.compose = undefined;
      this.browser = undefined;
      return;
    } else {
      const nextVideo = video.message.value;
      debuglog("Creating nodes for browser overlay", { id: this.id, metadata: nextVideo });
      if (this.currentVideo) {
        if (nextVideo.height !== this.currentVideo.height || nextVideo.width !== this.currentVideo.width) {
          debuglog("Closing nodes for browser overlay because of metadata change", { id: this.id, old: this.currentVideo, new: nextVideo });
          await this.compose?.close();
          await this.browser?.close();
          this.currentVideo = undefined;
        }
      }
      this.currentVideo = nextVideo;

      if (!this.compose) {
        const thisCompose = this.compose = await this.norsk.processor.transform.videoCompose<"video" | "overlay">({
          id: `${this.cfg.id}-compose`,
          onCreate: (n) => {
            this.relatedMediaNodes.addInput(n);
            this.relatedMediaNodes.addOutput(n);
          },
          onClose: () => {
            this.relatedMediaNodes.removeInput(thisCompose);
            this.relatedMediaNodes.removeOutput(thisCompose);
          },
          referenceStream: 'video',
          referenceResolution: { width: 100, height: 100 },
          hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["quadra", "nvidia"]),
          parts: [
            {
              pin: "video",
              opacity: 1.0,
              zIndex: 0,
              sourceRect: { x: 0, y: 0, width: 100, height: 100 },
              destRect: { x: 0, y: 0, width: 100, height: 100 }
            }, {
              pin: "overlay",
              opacity: 1.0,
              zIndex: 1,
              sourceRect: { x: 0, y: 0, width: 100, height: 100 },
              destRect: { x: 0, y: 0, width: 100, height: 100 }
            }
          ],
          outputResolution: { width: nextVideo.width, height: nextVideo.height }
        })
      }
      if (!this.browser) {
        const thisBrowser = this.browser = await this.norsk.input.browser({
          onCreate: (n) => {
            this.relatedMediaNodes.addInput(n);
          },
          onClose: () => {
            this.relatedMediaNodes.removeInput(thisBrowser);
          },
          id: `${this.cfg.id}-browser`,
          url: this.cfg.url,
          resolution: { width: nextVideo.width, height: nextVideo.height },
          sourceName: `${this.id}-browser`,
          frameRate: nextVideo.frameRate ?? { frames: 25, seconds: 1 }
        })
      }
      this.compose.subscribeToPins([
        { source: this.browser, sourceSelector: videoToPin<"video" | "overlay">("overlay") },
        this.videoSource.selectVideoToPin<"video" | "overlay">("video")[0]
      ])
    }
  }

  async close() {
    await this.browser?.close();
    await this.compose?.close();
    this.browser = undefined;
    this.compose = undefined;
  }

}

