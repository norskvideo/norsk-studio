import { Norsk, ReceiveFromAddressAuto, RtmpConnectionFailureReason, RtmpOutputNode, RtmpOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, InstanceRouteArgs, InstanceRouteInfo, OnCreated, RelatedMediaNodes, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import path from 'path';
import { paths } from './types';
import { BaseConfig } from '@norskvideo/norsk-studio/lib/extension/client-types';
import { defineApi } from '@norskvideo/norsk-studio/lib/server/api';

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
} | { type: "output-enabled" | "output-disabled" }

export type RtmpOutputCommand = {
  type: "enable-output" | "disable-output"
}


export abstract class BaseRtmpOutputDefinition<Settings extends BaseConfig> implements ServerComponentDefinition<Settings, RtmpOutput, RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent> {
  abstract getConfig(input: Settings): Promise<SdkSettings>;

  async create(norsk: Norsk, cfg: Settings, cb: OnCreated<RtmpOutput>, runtime: StudioRuntime<RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>) {
    const node = new RtmpOutput(norsk, runtime, cfg, async () => this.getConfig(cfg))
    await node.initialised;
    cb(node);
  }

  async handleCommand(node: RtmpOutput, command: RtmpOutputCommand) {
    switch (command.type) {
      case 'enable-output':
        await node.enableOutput();
        break;
      case 'disable-output':
        await node.disableOutput();
        break;
    }
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<Settings, RtmpOutput, RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>[]> {
    return defineApi<paths, InstanceRouteArgs<Settings, RtmpOutput, RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>>(path.join(__dirname, 'types.yaml'), {
      "/enable": {
        post: ({ runtime }) => (_req, res) => {
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
      "/disable": {
        post: ({ runtime }) => async (_req, res) => {
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
    });
  }
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}

export default class RtmpOutputDefinition extends BaseRtmpOutputDefinition<RtmpOutputSettings> {
  async getConfig(cfg: RtmpOutputSettings) {
    return {
      url: cfg.url,
      bufferDelayMs: cfg.bufferDelayMs,
      avDelayMs: cfg.avDelayMs,
      retryConnectionTimeout: cfg.retryConnectionTimeout,
    }
  }
}

export class RtmpOutput implements CreatedMediaNode {
  initialised: Promise<void>;
  norsk: Norsk;
  runtime: StudioRuntime<RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>;

  cfg: BaseConfig;
  rtmp?: RtmpOutputNode;
  enabled: boolean = true;
  control: ContextPromiseControl = new ContextPromiseControl(this.subscribeImpl.bind(this));
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();
  id: string;
  fn: () => Promise<SdkSettings>;

  currentSources: Map<CreatedMediaNode, StudioNodeSubscriptionSource> = new Map();

  constructor(norsk: Norsk, runtime: StudioRuntime<RtmpOutputState, RtmpOutputCommand, RtmpOutputEvent>,
    cfg: BaseConfig,
    fn: () => Promise<SdkSettings>) {
    this.id = cfg.id;
    this.cfg = cfg;
    this.fn = fn;
    this.norsk = norsk;
    this.runtime = runtime;
    this.initialised = Promise.resolve();
  }

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
      this.enabled = false;
      if (this.rtmp) {
        await this.rtmp.close();
        this.rtmp = undefined;
      }
      this.runtime.updates.raiseEvent({
        type: 'output-disabled'
      })
      debuglog("Output disabled", { id: this.id });
    }
  }

  subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts): void {
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
        const settings = await this.fn();
        const rtmpCfg: SdkSettings = {
          id: this.cfg.id,
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
          },
          ...settings
        }
        this.rtmp = await this.norsk.output.rtmp(rtmpCfg);
      }
      this.rtmp.subscribe(subscriptions, (ctx) => {
        return ctx.streams.length === subscriptions.length;
      })
    } else {
      await this.rtmp?.close();
      this.rtmp = undefined;
    }
  }
}


