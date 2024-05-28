import { BrowserInputNode, Norsk, StreamMetadata, videoToPin } from '@norskvideo/norsk-sdk';

import { OnCreated, ServerComponentDefinition, StudioNodeSubscriptionSource } from 'norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode } from "norsk-studio/lib/extension/base-nodes";
import { debuglog } from 'norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from 'norsk-studio/lib/shared/config';

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

export class BrowserOverlay extends CustomAutoDuplexNode {
  browser?: BrowserInputNode;
  norsk: Norsk;

  cfg: BrowserOverlayConfig;
  videoSource?: StudioNodeSubscriptionSource;
  initialised: Promise<void>;

  static async create(norsk: Norsk, cfg: BrowserOverlayConfig) {
    const node = new BrowserOverlay(norsk, cfg);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: BrowserOverlayConfig) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.initialised = this.initialise();
  }

  async initialise() {
    const compose = await this.norsk.processor.transform.videoCompose(
      (streams: StreamMetadata[]) => {
        if (streams.length != 1) { return undefined; }
        if (streams[0].message.case != "video") { return undefined; }
        debuglog("Setting up compose for overlay node", { stream: streams[0] })

        return {
          id: `${this.cfg.id}-compose`,
          referenceStream: 'source',
          referenceResolution: { width: 100, height: 100 },
          hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["quadra", "nvidia"]),
          parts: [
            {
              pin: "source",
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
          outputResolution: { width: streams[0].message.value.width, height: streams[0].message.value.height }
        }
      });
    this.setup({ input: compose, output: [compose] });
  }

  override subscribe(sources: StudioNodeSubscriptionSource[]) {
    this.videoSource = sources[0];

    this.innerInput?.subscribeToPins(
      this.videoSource.selectVideoToPin("source")
      ,
      (ctx) => {
        if (ctx.streams.length == 1) {
          // We'll accept, and we'll also fire off the browser source
          // we won't block tho, who cares if the first few frames don't have an overlay??
          void this.startBrowserSource(ctx.streams[0]);
          return "accept";
        } else {
          // allow null contexts through so compose can shut itself down
          return "accept";
        }
      });
  }

  async startBrowserSource(videoMetadata: StreamMetadata) {
    if (videoMetadata.message.case != "video")
      throw "Browser overlay component only accepts video";
    if (!this.videoSource)
      throw "Video source wasn't created"; // really need to work out how to structure those base classes better..

    debuglog("Spinning up browser input for overla node", { metadata: videoMetadata })
    // Start a browser source that matches resolution and framerate
    // ?Leave the id server-side?
    this.browser = await this.norsk.input.browser({
      id: `${this.cfg.id}-browser`,
      url: this.cfg.url,
      resolution: { width: videoMetadata.message.value.width, height: videoMetadata.message.value.height },
      sourceName: `${this.id}-browser`,
      frameRate: videoMetadata.message.value.frameRate ?? { frames: 25, seconds: 1 }
    });

    // Check the sub, if we lose the original video
    // then we want to stop the browser so compose can tidy itself up
    this.innerInput?.subscribeToPins(
      this.videoSource.selectVideoToPin<"source" | "overlay">("source").concat([
        {
          source: this.browser,
          sourceSelector: videoToPin("overlay")
        }
      ]),
      (ctx) => {
        // If there is only reference, that's fine
        // If there is only browser, we need to stop the browser
        // if there is null, that's fine
        if (ctx.streams.length == 0) { return "accept"; } // compose should flush
        if (ctx.streams.length == 2) {
          return "accept";
        }

        // I think we can assume that if we only see this
        // that we can shut down, because to get this created, the context
        // from the *source* should already exist in the controller
        if (ctx.streams[0].streamKey?.sourceName == "browser") {
          void this.stopBrowserSource();
          return "accept"; // but allow it anyway
        }
        throw "Unknown number of streams encountered in browser overlay component";

      });
  }

  override async close() {
    await this.stopBrowserSource();
    await super.close();
  }

  async stopBrowserSource() {
    debuglog("Stopping browser source", { id: this.id })
    await this.browser?.close();
    this.browser = undefined;
  }
}

