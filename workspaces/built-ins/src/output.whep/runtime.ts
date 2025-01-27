import { Norsk, ReceiveFromAddressAuto, WhepOutputSettings as SdkSettings, WhepOutputNode } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SimpleSinkWrapper, SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { IceServer } from '@norskvideo/norsk-studio/lib/shared/config';
import {webRtcSettings} from '../shared/webrtcSettings';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';

export type WhepOutputSettings = {
  id: string;
  displayName: string,
  bufferDelayMs?: SdkSettings['bufferDelayMs'];
  showPreview?: boolean;
  __global: {
    iceServers: IceServer[];
  }
};

export type WhepOutputState = {
  url?: string;
};

export type WhepOutputEvent = {
  type: 'url-published';
  url: string;
};

export type WhepOutputCommand = object;

export class WhepOutput extends CustomSinkNode {
   initialised: Promise<void>;
    norsk: Norsk;
    updates: RuntimeUpdates<WhepOutputState, WhepOutputCommand, WhepOutputEvent>;
    shared: StudioShared;
  
  
    cfg: WhepOutputSettings;
    whep?: WhepOutputNode;
    context: ContextPromiseControl = new ContextPromiseControl(this.subscribeImpl.bind(this));
  
    constructor(norsk: Norsk, { updates, shared }: StudioRuntime<WhepOutputState, WhepOutputCommand, WhepOutputEvent>, cfg: WhepOutputSettings) {
      super(cfg.id);
      this.cfg = cfg;
      this.norsk = norsk;
      this.updates = updates;
      this.shared = shared;
      this.initialised = Promise.resolve();
    }

    override subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts): void {
      this.context.setSources(sources);
    }
  
    async subscribeImpl(sources: StudioNodeSubscriptionSource[]) {
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
                this.updates.raiseEvent({ type: 'url-published', url });
                this.updates.update({ url });
              }
            },
            ...webRtcSettings(this.cfg.__global.iceServers)
          };
  
          this.whep = await this.norsk.output.whep(whepCfg);
        }
  
        // Subscribe to all available streams
        this.whep?.subscribe(subscriptions, (ctx) => {
          return ctx.streams.length === subscriptions.length;
        });
      } else {
        // Clean up if no sources
        await this.whep?.close();
        this.whep = undefined;
        this.updates.update({});
      }
    }
  
}

export default class WhepOutputDefinition implements ServerComponentDefinition<WhepOutputSettings, SimpleSinkWrapper, WhepOutputState, WhepOutputCommand, WhepOutputEvent> {
  async create(norsk: Norsk, cfg: WhepOutputSettings, cb: OnCreated<SimpleSinkWrapper>, runtime: StudioRuntime<WhepOutputState, WhepOutputCommand, WhepOutputEvent>) {
    const node = new WhepOutput(norsk, runtime, cfg);
    runtime.report.registerOutput(cfg.id, node.whep?.endpointUrl);
    await node.initialised;
    cb(node);
  }
}
