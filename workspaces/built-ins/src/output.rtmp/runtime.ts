import { Norsk, ReceiveFromAddressAuto, RtmpConnectionFailureReason, RtmpOutputNode, RtmpOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, InstanceRouteInfo, OnCreated, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { paths } from './types';


export type RtmpOutputSettings = {
  id: string;
  displayName: string,
  notes?: string,
  url: string;
  bufferDelayMs?: SdkSettings['bufferDelayMs'];
  avDelayMs?: SdkSettings['avDelayMs'];
  retryConnectionTimeout?: number;
};

export type RtmpOutputState = {
  enabled: boolean;
  connected: boolean;
  connectRetries: number;
}

export type RtmpOutputEvent = {
  type: "rtmp-server-connected-and-publishing",
} | {
  type: "rtmp-server-connection-failed-retry",
} | {type: "output-enabled" | "output-disabled" }

export type RtmpOutputCommand = {
  type: "enable-output" | "disable-output"
}

class RtmpOutput extends CustomSinkNode {
  initialised: Promise<void>;
  norsk: Norsk;
  runtime: StudioRuntime<RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>;

  cfg: RtmpOutputSettings;
  rtmp?: RtmpOutputNode;
  enabled: boolean = true;
  control: ContextPromiseControl = new ContextPromiseControl(this.subscribeImpl.bind(this));
    
  currentSources: Map<CreatedMediaNode, StudioNodeSubscriptionSource> = new Map();


  constructor(norsk: Norsk, runtime: StudioRuntime<RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>, cfg: RtmpOutputSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.runtime = runtime;
    //this.initialised = this.initialise();
    this.initialised = Promise.resolve();
  }

  // async initialise() {
  //   const rtmpCfg: SdkSettings = {
  //     id: this.cfg.id,
  //     url: this.cfg.url,
  //     bufferDelayMs: this.cfg.bufferDelayMs,
  //     avDelayMs: this.cfg.avDelayMs,
  //     retryConnectionTimeout: this.cfg.retryConnectionTimeout,
  //     onPublishStart: () => {
  //       this.runtime.updates.clearAlert('connection-error');
  //       this.runtime.updates.raiseEvent({ type: "rtmp-server-connected-and-publishing" })
  //     },
  //     onConnectionFailure: (reason: RtmpConnectionFailureReason) => {
  //       this.runtime.updates.setAlert('connection-error', { level: 'error', message: "Failed to connect" });
  //       switch (reason) {
  //         case RtmpConnectionFailureReason.RtmpConnectionFailedRetry:
  //           this.runtime.updates.raiseEvent({ type: "rtmp-server-connection-failed-retry" })
  //           break;
  //         default:
  //           assertUnreachable(reason)
  //       }
  //     }
  //   }
  //   this.rtmp = await this.norsk.output.rtmp(rtmpCfg)
  //   this.setup({ sink: this.rtmp, updates: this.runtime.updates }, { requireOneOfEverything: true });
  // }

  async enableOutput() {
      if (!this.enabled) {
        this.enabled = true;   
        await this.control.schedule();
        this.runtime.updates.raiseEvent({ type: 'output-enabled' });
        debuglog("Output enabled", { id: this.id });
      }
    }
  
    async disableOutput() {
      if (this.enabled) {
        this.enabled =false;
        if (this.rtmp){
          await this.rtmp.close();
          this.rtmp = undefined;
        }    
        this.runtime.updates.raiseEvent({
          type: 'output-disabled'
        })
        debuglog("Output disabled", { id: this.id });
      }
    }
  
    override subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts): void {
        this.currentSources = new Map();
        sources.forEach((s) => {
          this.currentSources.set(s.source, s);
        });
        
        this.control.setSources(sources);
    }
  
    async subscribeImpl(sources: StudioNodeSubscriptionSource[]) {
      if (!this.enabled) {
        debuglog("Skipping context handling - output disabled", { id: this.id });
        return;
      }
  
      //for (const [_, source] of this.currentSources) {
        // if (source) {
          const videoSource = sources.filter((s) => s.streams.select.includes("video")).at(0)?.selectVideo();
          const audioSource = sources.filter((s) => s.streams.select.includes("audio")).at(0)?.selectAudio();
      
          const subscriptions: ReceiveFromAddressAuto[] = [];
      
          if (videoSource && videoSource.length > 0) {
            subscriptions.push(videoSource[0]);
          }
      
          if (audioSource && audioSource.length > 0) {
            subscriptions.push(audioSource[0]);
          }
  
          if (subscriptions.length > 0) {
            if (!this.rtmp) {
              // const node = await this.norsk.output.srt({
              //   ...this.cfg,
              //   ...this.cfg.socketOptions,
              //   id: this.cfg.id,
              // });
              // this.rtmp = node;

              const rtmpCfg: SdkSettings = {
                id: this.cfg.id,
                url: this.cfg.url,
                bufferDelayMs: this.cfg.bufferDelayMs,
                avDelayMs: this.cfg.avDelayMs,
                retryConnectionTimeout: this.cfg.retryConnectionTimeout,
                onPublishStart: () => {
                  this.runtime.updates.clearAlert('connection-error');
                  this.runtime.updates.raiseEvent({ type: "rtmp-server-connected-and-publishing" })
                },
                onConnectionFailure: (reason: RtmpConnectionFailureReason) => {
                  this.runtime.updates.setAlert('connection-error', { level: 'error', message: "Failed to connect" });
                  switch (reason) {
                    case RtmpConnectionFailureReason.RtmpConnectionFailedRetry:
                      this.runtime.updates.raiseEvent({ type: "rtmp-server-connection-failed-retry" })
                      break;
                    default:
                      assertUnreachable(reason)
                  }
                }
              }
              this.rtmp = await this.norsk.output.rtmp(rtmpCfg);
              this.setup({ sink: this.rtmp, updates: this.runtime.updates }, { requireOneOfEverything: true });
            }
            this.rtmp.subscribe(subscriptions, (ctx) => {
              return ctx.streams.length === subscriptions.length;
            })
          } else {
            await this.rtmp?.close();
            this.rtmp = undefined;
          }
        //}
      //}
  }
}

type Transmuted<T> = {
  [Key in keyof T]: OpenAPIV3.PathItemObject;
};
function coreInfo<T>(path: keyof T, op: OpenAPIV3.OperationObject) {
  return {
    url: path,
    summary: op.summary,
    description: op.description,
    requestBody: op.requestBody,
    responses: op.responses,
  }
}

function post<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['post']!),
    method: 'POST' as const,
  }
}

export default class RtmpOutputDefinition implements ServerComponentDefinition<RtmpOutputSettings, RtmpOutput, RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent> {
  async create(norsk: Norsk, cfg: RtmpOutputSettings, cb: OnCreated<RtmpOutput>, runtime : StudioRuntime<RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>) {
    const node = new RtmpOutput(norsk, runtime, cfg)
    await node.initialised;
    cb(node);
  }

  async handleCommand(node:RtmpOutput, command:RtmpOutputCommand) {
      switch (command.type) {
        case 'enable-output':
          await node.enableOutput();
          break;
        case 'disable-output':
          await node.disableOutput();
          break;
      }
    }
  
    async instanceRoutes(): Promise<InstanceRouteInfo<RtmpOutputSettings,RtmpOutput,RtmpOutputState,RtmpOutputCommand,RtmpOutputEvent>[]> {
      const types = await fs.readFile(path.join(__dirname, 'types.yaml'));
      const root = YAML.parse(types.toString());
      const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
      const paths = resolved.paths as Transmuted<paths>;
  
      return [
        {
          ...post<paths>('/enable', paths),
          handler: ({ runtime }) => async (_req, res) => {
            try {
              const state = runtime.updates.latest();
              if (state.enabled) {
                return res.status(400).json({ error: 'Output is already enabled' });
              }
              runtime.updates.sendCommand({
                type: 'enable-output'
              });
              res.sendStatus(204);
            } catch (error) {
              console.error('Error in enable handler:', error);
              res.status(500).json({ error: 'Failed to enable output' });
            }
          }
        },
        {
          ...post<paths>('/disable', paths),
          handler: ({ runtime }) => async (_req, res) => {
            try {
              const state = runtime.updates.latest();
              if (!state.enabled) {
                return res.status(400).json({ error: 'Output is already disabled' });
              }
              runtime.updates.sendCommand({
                type: 'disable-output'
              });
              res.sendStatus(204);
            } catch (error) {
              console.error('Error in disable handler:', error);
              res.status(500).json({ error: 'Failed to disable output' });
            }
          }
        }
      ];
    }
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
