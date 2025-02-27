import { Norsk, ReceiveFromAddressAuto, WhepOutputSettings as SdkSettings, WhepOutputNode } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, InstanceRouteArgs, OnCreated, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { IceServer } from '@norskvideo/norsk-studio/lib/shared/config';
import { webRtcSettings } from '../shared/webrtcSettings';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import path from 'path';
import { paths } from './types';
import { defineApi } from '@norskvideo/norsk-studio/lib/server/api';

export type WhepOutputSettings = {
  id: string;
  displayName: string,
  notes?: string,
  bufferDelayMs?: SdkSettings['bufferDelayMs'];
  showPreview?: boolean;
  __global: {
    iceServers: IceServer[];
  }
};

export type WhepOutputState = {
  url?: string;
  enabled: boolean,
};

export type WhepOutputEvent = {
  type: 'output-enabled' | 'output-disabled'
} | { type: 'url-published', url: string }

export type WhepOutputCommand = {
  type: "enable-output" | "disable-output"
}

export class WhepOutput extends CustomSinkNode {
  norsk: Norsk;
  runtime: StudioRuntime<WhepOutputState, WhepOutputCommand, WhepOutputEvent>;

  cfg: WhepOutputSettings;
  whep?: WhepOutputNode;
  context: ContextPromiseControl = new ContextPromiseControl(this.subscribeImpl.bind(this));

  currentSources: Map<CreatedMediaNode, StudioNodeSubscriptionSource> = new Map();

  initialised: Promise<void>
  enabled: boolean = true;

  static async create(norsk: Norsk, cfg: WhepOutputSettings, runtime: StudioRuntime<WhepOutputState, WhepOutputCommand, WhepOutputEvent>) {
    const node = new WhepOutput(cfg, norsk, runtime);
    await node.initialised;
    return node;
  }

  constructor(cfg: WhepOutputSettings, norsk: Norsk, runtime: StudioRuntime<WhepOutputState, WhepOutputCommand, WhepOutputEvent>) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.runtime = runtime;
    this.initialised = Promise.resolve();
  }

  override subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts): void {
    this.currentSources = new Map();
    sources.forEach((s) => {
      this.currentSources.set(s.source, s);
    });

    this.context.setSources(sources);
  }

  async subscribeImpl(sources: StudioNodeSubscriptionSource[]) {
    if (!this.enabled) {
      debuglog("Skipping subscription - output disabled", { id: this.id });
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
      if (!this.whep) {
        const whepCfg: SdkSettings = {
          id: `${this.cfg.id}-whep`,
          bufferDelayMs: this.cfg.bufferDelayMs,
          onPublishStart: () => {
            const url = this.whep?.endpointUrl;
            if (url) {
              this.runtime.updates.raiseEvent({ type: 'url-published', url })
            }
          },
          ...webRtcSettings(this.cfg.__global.iceServers)
        };

        this.whep = await this.norsk.output.whep(whepCfg);
      }
      this.whep?.subscribe(subscriptions, (ctx) => {
        return ctx.streams.length === subscriptions.length;
      });
    } else {
      await this.whep?.close();
      this.whep = undefined;
    }
  }

  async enableOutput() {
    if (!this.enabled) {
      this.enabled = true;
      const sources = Array.from(this.currentSources.values());
      debuglog("Sources", sources);
      await this.subscribeImpl(sources)
      this.runtime.updates.raiseEvent({ type: 'output-enabled' });
      debuglog("Output enabled", { id: this.id });
    }
  }

  async disableOutput() {
    if (this.enabled) {
      this.enabled = false;

      if (this.whep) {
        await this.whep.close();
        this.whep = undefined;
      }

      this.runtime.updates.raiseEvent({ type: 'output-disabled' });
      debuglog("Output disabled", { id: this.id });
    }
  }
}

export default class WhepOutputDefinition implements ServerComponentDefinition<WhepOutputSettings, WhepOutput, WhepOutputState, WhepOutputCommand, WhepOutputEvent> {
  async create(norsk: Norsk, cfg: WhepOutputSettings, cb: OnCreated<WhepOutput>, runtime: StudioRuntime<WhepOutputState, WhepOutputCommand, WhepOutputEvent>) {
    const node = new WhepOutput(cfg, norsk, runtime);
    runtime.report.registerOutput(cfg.id, node.whep?.endpointUrl);
    await node.initialised;
    cb(node);
  }

  async handleCommand(node: WhepOutput, command: WhepOutputCommand) {
    switch (command.type) {
      case 'enable-output':
        await node.enableOutput();
        break;
      case 'disable-output':
        await node.disableOutput();
        break;
    }
  }

  async instanceRoutes() {
    return defineApi<paths, InstanceRouteArgs<WhepOutputSettings, WhepOutput, WhepOutputState, WhepOutputCommand, WhepOutputEvent>>(
      path.join(__dirname, 'types.yaml'),
      {
        '/enable': {
          post: ({ runtime }) => async (_req, res) => {
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
        '/disable': {
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
