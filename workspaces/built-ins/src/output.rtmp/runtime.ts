import { Norsk, RtmpConnectionFailureReason, RtmpOutputNode, RtmpOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

export type RtmpOutputSettings = {
  id: string;
  displayName: string,
  url: string;
  bufferDelayMs?: SdkSettings['bufferDelayMs'];
  avDelayMs?: SdkSettings['avDelayMs'];
  retryConnectionTimeout?: number;
};

export type RtmpOutputState = {
  connected: boolean;
  connectRetries: number;
}

export type RtmpOutputEvent = {
  type: "rtmp-server-connected-and-publishing",
} | {
  type: "rtmp-server-connection-failed-retry",
}

export default class RtmpOutputDefinition implements ServerComponentDefinition<RtmpOutputSettings, SimpleSinkWrapper, RtmpOutputState, RtmpOutputEvent> {
  async create(norsk: Norsk, cfg: RtmpOutputSettings, cb: OnCreated<SimpleSinkWrapper>, { updates }: StudioRuntime<RtmpOutputState, RtmpOutputEvent>) {
    const node = new RtmpOutput(norsk, updates, cfg)
    await node.initialised;
    cb(node);
  }
}

class RtmpOutput extends CustomSinkNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<RtmpOutputState, RtmpOutputEvent>;

  cfg: RtmpOutputSettings;
  rtmp?: RtmpOutputNode;

  constructor(norsk: Norsk, updates: RuntimeUpdates<RtmpOutputState, RtmpOutputEvent>, cfg: RtmpOutputSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
  }

  async initialise() {
    const rtmpCfg: SdkSettings = {
      id: this.cfg.id,
      url: this.cfg.url,
      bufferDelayMs: this.cfg.bufferDelayMs,
      avDelayMs: this.cfg.avDelayMs,
      retryConnectionTimeout: this.cfg.retryConnectionTimeout,
      onPublishStart: () => { this.updates.raiseEvent({ type: "rtmp-server-connected-and-publishing" }) },
      onConnectionFailure: (reason: RtmpConnectionFailureReason) => {
        switch (reason) {
          case RtmpConnectionFailureReason.RtmpConnectionFailedRetry:
            this.updates.raiseEvent({ type: "rtmp-server-connection-failed-retry" })
            break;
          default:
            assertUnreachable(reason)
        }
      }
    }
    this.rtmp = await this.norsk.output.rtmp(rtmpCfg)
    this.setup({ sink: this.rtmp }, { requireOneOfEverything: true });
  }
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
