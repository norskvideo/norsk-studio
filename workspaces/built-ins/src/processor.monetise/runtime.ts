import { AncillaryNode, JitterBufferNode, Norsk, WhepOutputSettings as SdkSettings, SourceMediaNode, StreamMetadataOverrideNode, WhepOutputNode, requireAV, selectAV, selectAncillary, selectVideo } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from 'norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode, SubscriptionOpts } from 'norsk-studio/lib/extension/base-nodes';
import { assertUnreachable } from 'norsk-studio/lib/shared/util';
import { HardwareAccelerationType } from 'norsk-studio/lib/shared/config';

export type MonetiseOutputSettings = {
  id: string;
  displayName: string,
  __global: {
    iceServers: string[];
    hardware?: HardwareAccelerationType;
  }
};

export type MonetiseOutputState = {
  url?: string
  currentAdvert?: { timeLeftMs: number }
}


export type MonetiseOutputEvent = {
  type: 'url-published',
  url: string
} | {
  type: 'advert-started',
  durationMs: number
} | {
  type: 'advert-tick',
  timeLeftMs: number
} | {
  type: 'advert-finished'
};

export type MonetiseOutputCommand = {
  type: 'inject-advert',
  durationMs: number
};

export default class WhepOutputDefinition implements ServerComponentDefinition<MonetiseOutputSettings, MonetiseOutput, MonetiseOutputState, MonetiseOutputCommand, MonetiseOutputEvent> {
  async create(norsk: Norsk, cfg: MonetiseOutputSettings, cb: OnCreated<MonetiseOutput>, runtime: StudioRuntime<MonetiseOutputState, MonetiseOutputEvent>) {
    const node = new MonetiseOutput(norsk, runtime, cfg);
    await node.initialised;
    cb(node);
  }

  handleCommand(node: MonetiseOutput, command: MonetiseOutputCommand) {
    const t = command.type;
    switch (t) {
      case 'inject-advert':
        node.injectAdvert(command.durationMs);
        break;
      default:
        assertUnreachable(t);
    }

  }
}

class MonetiseOutput extends CustomAutoDuplexNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<MonetiseOutputState, MonetiseOutputEvent>;
  shared: StudioShared;

  cfg: MonetiseOutputSettings;
  encoder?: SourceMediaNode;
  whep?: WhepOutputNode;

  delayed?: JitterBufferNode;
  ancillary?: AncillaryNode;
  output?: StreamMetadataOverrideNode;

  start: Date;

  constructor(norsk: Norsk, runtime: StudioRuntime<MonetiseOutputState, MonetiseOutputEvent>, cfg: MonetiseOutputSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = runtime.updates;
    this.shared = runtime.shared;
    this.initialised = this.initialise();
    this.start = new Date();
  }

  async initialise() {
    const whepCfg: SdkSettings = {
      id: `${this.cfg.id}-whep`,
      bufferDelayMs: 500.0,
      iceServers: this.cfg.__global.iceServers.map((s) => ({ urls: [s] })), // not sure about turn
    };
    this.whep = await this.norsk.output.whep(whepCfg);
    this.ancillary = await this.norsk.processor.transform.ancillary({ id: `${this.cfg.id}-inject` });
    this.delayed = await this.norsk.processor.transform.jitterBuffer({
      id: `${this.cfg.id}-delay`,
      // not convinced we even need this at all, 
      // I think the theory is that we hold into the video for a bit before passing it on
      // so that the ancillary data we inject ends up arriving at the same time once in a sync
      // but I think in reality the turnaround is so fast it wouldn't matter
      delayMs: 2000
    })
    this.output = await this.norsk.processor.transform.streamMetadataOverride({
      id: `${this.cfg.id}-output`
    })
    this.output.subscribe([
      { source: this.ancillary, sourceSelector: selectAncillary },
      { source: this.delayed, sourceSelector: selectAV }
    ])

    this.setup({
      input: this.delayed,
      output: [this.output]
    })
  }

  injectAdvert(durationMs: number) {
    this.updates.raiseEvent({ type: 'advert-started', durationMs })

    let remaining = durationMs;
    const updateTick = setInterval(() => {
      remaining -= 1000;
      this.updates.raiseEvent({
        type: 'advert-tick',
        timeLeftMs: Math.max(0, remaining)
      })
    }, 1000);

    setTimeout(() => {
      this.updates.raiseEvent({ type: 'advert-finished' })
      clearInterval(updateTick);
    }, durationMs);


    const id = Math.random().toString().slice(-5);
    // Should base this off our video key?
    this.ancillary?.sendScte35({
      streamId: 1,
      programNumber: 1,
      sourceName: 'monetise',
      renditionName: 'default'
    }, {
      sapType: 3,
      protocolVersion: 0,
      encryptedPacket: false,
      encryptionAlgorithm: 0,
      ptsAdjustment: BigInt(0),
      cwIndex: 0,
      tier: 4095,
      spliceCommand: {
        type: "insert",
        value: {
          spliceEventId: Number(id),
          spliceEventCancelIndicator: false,
          outOfNetworkIndicator: true,
          spliceImmediateFlag: true,
          mode: {
            mode: 'program'
          },
          breakDuration: { autoReturn: true, duration: BigInt(durationMs * 90) },
          uniqueProgramId: 12345,
          availNum: 0,
          availsExpected: 0
        },
      },
      descriptors: []
    }
    );
  }

  override subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts | undefined): void {
    if (!this.whep) return;
    this.delayed?.subscribe(sources.flatMap((s) => s.selectAV()))
    void this.setupPreview(sources);
  }

  async setupPreview(sources: StudioNodeSubscriptionSource[]) {
    const videoSource = sources.find((s) => s.streams.select.includes("video"));
    const audioSource = sources.find((s) => s.streams.select.includes("audio"));

    if (!videoSource) return;
    if (!audioSource) return;

    this.encoder = await this.shared.previewEncode(videoSource.selectVideo()[0], this.cfg.__global.hardware);
    this.whep?.subscribe(
      [
        { source: this.encoder, sourceSelector: selectVideo },
        audioSource.selectAudio()[0]
      ], (ctx) => {
        if (ctx.streams.length == 2 && this.whep?.endpointUrl) {
          this.updates.raiseEvent({ type: 'url-published', url: this.whep?.endpointUrl })
        }
        return requireAV(ctx);
      })

  }
}
