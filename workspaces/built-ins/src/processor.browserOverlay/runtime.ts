import { BrowserInputNode, ComposePart, Norsk, VideoComposeDefaults, VideoComposeNode, VideoStreamMetadata, videoToPin } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, InstanceRouteInfo, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';
import { paths } from './openApi';
import fs from 'fs/promises';
import path from 'path';
import { resolveRefs } from 'json-refs';
import YAML from 'yaml';
import { OpenAPIV3 } from 'openapi-types';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';

export type BrowserOverlayConfig = {
  __global: {
    hardware?: HardwareAccelerationType
  },
  id: string,
  displayName: string,
  url: string
}

export type BrowserOverlayState = {
  currentUrl: string,
  enabled: boolean
}

export type BrowserOverlayCommand  
  = BrowserOverlayChangeUrlCommand
  | BrowserOverlayEnableCommand
  | BrowserOverlayDisableCommand

export type BrowserOverlayChangeUrlCommand = {
  type: 'change-url',
  url: string;
}

export type BrowserOverlayEnableCommand = {
  type: 'enable',
}

export type BrowserOverlayDisableCommand = {
  type: 'disable',
}

export type BrowserOverlayEvent 
   = BrowserOverlayChangedUrlEvent
   | BrowserOverlayEnabledEvent
   | BrowserOverlayDisabledEvent

export type BrowserOverlayChangedUrlEvent = {
  type: 'url-changed',
  url: string;
}

export type BrowserOverlayEnabledEvent = {
  type: 'enabled',
}

export type BrowserOverlayDisabledEvent = {
  type: 'disabled',
}

export default class BrowserOverlayDefinition implements ServerComponentDefinition<BrowserOverlayConfig, BrowserOverlay, BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent> {
  async create(norsk: Norsk, cfg: BrowserOverlayConfig, cb: OnCreated<BrowserOverlay>, runtime: StudioRuntime<BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>) {
    const node = await BrowserOverlay.create(norsk, cfg, runtime.updates);
    cb(node);
  }

  async handleCommand(node: BrowserOverlay, command: BrowserOverlayCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'change-url':
        await node.changeUrl(command.url);
        break;
      case 'enable':
        await node.enable();
        break;
      case 'disable':
        await node.disable();
        break;
      default:
        assertUnreachable(commandType);

    }
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<BrowserOverlayConfig, BrowserOverlay, BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>[]> {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);

    type Transmuted<T> = {
      [Key in keyof T]: OpenAPIV3.PathItemObject;
    };
    const paths = resolved.paths as Transmuted<paths>;

    const coreInfo = (path: string, op: OpenAPIV3.OperationObject) => {
      return {
        url: path,
        summary: op.summary,
        description: op.description,
        requestBody: op.requestBody,
        responses: op.responses,
      }
    }

    const get = (path: keyof paths) => {
      return {
        ...coreInfo(path, paths[path]['get']!),
        method: 'GET' as const,
      }
    };
    const post = (path: keyof paths) => {
      return {
        ...coreInfo(path, paths[path]['post']!),
        method: 'POST' as const,
      }
    };
    // const delete_ = (path: keyof paths) => {
    //   return {
    //     ...coreInfo(path, paths[path]['delete']!),
    //     method: 'DELETE' as const,
    //   }
    // };

    return [
      {
        ...get('/url'),
        handler: ({runtime}) => (async (_req, res) => {
          res.send(runtime.updates.latest().currentUrl);
        })
      },
      {
        ...post('/url'),
        handler: ({runtime}) => (async (req, res) => {
          runtime.updates.sendCommand({type: "change-url", url: req.body.url});
          res.status(204).send();
        })
      },
      {
        ...get('/status'),
        handler: ({runtime}) => (async (_req, res) => {
          res.json({enabled: runtime.updates.latest().enabled})
        })
      },
      {
        ...post('/enable'),
        handler: ({runtime}) => (async (_req, res) => {
          const latest = runtime.updates.latest();
          if (latest.enabled) {
            res.status(309).json({error: "Browser overlay already enabled"});
          } 
          else {
            runtime.updates.sendCommand({type: "enable"});
            res.status(204).send();
          }
        })
      },
      {
        ...post('/disable'),
        handler: ({runtime}) => (async (_req, res) => {
          const latest = runtime.updates.latest();
          if (!latest.enabled) {
            res.status(309).json({error: "Browser overlay already disabled"});
          } 
          else {
            runtime.updates.sendCommand({type: "disable"});
            res.status(204).send();
          } 
        })
      },
      ]
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

  updates: RuntimeUpdates<BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>;
  control: ContextPromiseControl = new ContextPromiseControl(this.handleContext.bind(this));
  videoSource?: StudioNodeSubscriptionSource;
  cfg: BrowserOverlayConfig;
  initialised: Promise<void>;
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();
  enabledParts: ComposePart<'video' | 'overlay'>[];
  disabledParts:ComposePart<'video' | 'overlay'>[];   

  static async create(norsk: Norsk, cfg: BrowserOverlayConfig, updates: RuntimeUpdates<BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>) {
    const node = new BrowserOverlay(norsk, cfg, updates);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: BrowserOverlayConfig, updates: RuntimeUpdates<BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>) {
    this.id = cfg.id;
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
    this.enabledParts = [];
    this.disabledParts = [];
  }

  async initialise() {
    this.updates.raiseEvent({type: 'url-changed', url: this.cfg.url})
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
      this.enabledParts = [
            {
              pin: "video",
              opacity: 1.0,
              zIndex: 0,
              compose: VideoComposeDefaults.fullscreen()
            }, {
              pin: "overlay",
              opacity: 1.0,
              zIndex: 1,
              compose: VideoComposeDefaults.fullscreen()
            }
          ];
      this.disabledParts = [
            {
              pin: "video",
              opacity: 1.0,
              zIndex: 0,
              compose: VideoComposeDefaults.fullscreen()
            }
         ];

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
          hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["quadra", "nvidia"]),
          parts: this.enabledParts,
          outputResolution: { width: nextVideo.width, height: nextVideo.height }
        })
      }
      if (!this.browser) {
        this.browser = await this.norsk.input.browser({
          onCreate: (n) => {
            this.browser = n;
            this.relatedMediaNodes.addInput(n);
          },
          onClose: () => {
            if (this.browser)
              this.relatedMediaNodes.removeInput(this.browser);
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

  async changeUrl(newUrl: string) {
    if (this.browser) {
      this.cfg.url = newUrl;
      this.browser.updateConfig({url: newUrl})
      this.updates.raiseEvent({type: 'url-changed', url: this.cfg.url})
    }
  }

  async enable() {
    this.compose?.updateConfig({parts: this.enabledParts}) 
    this.updates.raiseEvent({type: 'enabled'})
  }

  async disable() {
    this.compose?.updateConfig({parts: this.disabledParts}) 
    this.updates.raiseEvent({type: 'disabled'})
  }
}

