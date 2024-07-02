import { AudioMeasureLevels, AudioMeasureLevelsNode, Norsk, ReceiveFromAddressAuto, WhepOutputSettings as SdkSettings, SourceMediaNode, WhepOutputNode, selectVideo } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SimpleSinkWrapper, SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { HardwareAccelerationType, IceServer } from '@norskvideo/norsk-studio/lib/shared/config';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';

export type PreviewOutputSettings = {
  id: string;
  displayName: string,
  bufferDelayMs?: SdkSettings['bufferDelayMs'],
  __global: {
    iceServers: IceServer[],
    hardware?: HardwareAccelerationType,
  }
};

export type PreviewOutputState = {
  url?: string
  levels?: { peak: number, rms: number }
}


export type PreviewOutputEvent = {
  type: 'url-published',
  url: string
} | {
  type: 'audio-levels',
  levels: {
    peak: number,
    rms: number
  }
}

export type PreviewOutputCommand = object;

// This should really be achieved with an image writer
// but I had a quick look and I'd need to write rust, erlang, purescript, and typescript
// to surface this functionality
export default class WhepOutputDefinition implements ServerComponentDefinition<PreviewOutputSettings, SimpleSinkWrapper, PreviewOutputState, PreviewOutputCommand, PreviewOutputEvent> {
  async create(norsk: Norsk, cfg: PreviewOutputSettings, cb: OnCreated<SimpleSinkWrapper>, runtime: StudioRuntime<PreviewOutputState, PreviewOutputEvent>) {
    const node = new PreviewOutput(norsk, runtime, cfg);
    await node.initialised;
    cb(node);
  }
}

class PreviewOutput extends CustomSinkNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<PreviewOutputState, PreviewOutputEvent>;
  shared: StudioShared;

  cfg: PreviewOutputSettings;
  encoder?: SourceMediaNode;
  whep?: WhepOutputNode;
  audioLevels?: AudioMeasureLevelsNode;

  constructor(norsk: Norsk, { updates, shared }: StudioRuntime<PreviewOutputState, PreviewOutputEvent>, cfg: PreviewOutputSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.shared = shared;
    this.initialised = this.initialise();
  }

  async initialise() {
    const whepCfg: SdkSettings = {
      id: `${this.cfg.id}-whep`,
      bufferDelayMs: this.cfg.bufferDelayMs,
      iceServers: this.cfg.__global.iceServers.map((s) =>
        ({ urls: [s.url], username: s.username, credential: s.credential })),
      onPublishStart: () => {
        const url = this.whep?.endpointUrl;
        if (url) {
          this.updates.raiseEvent({ type: 'url-published', url })
        }
      }
    };
    this.whep = await this.norsk.output.whep(whepCfg);

    this.audioLevels = await this.norsk.processor.control.audioMeasureLevels({
      id: `${this.cfg.id}-audiolevels`,
      onData: (levels: AudioMeasureLevels) => {
        const total = levels.channelLevels.reduce<{ rms: number, peak: number }>((acc, l) => {
          acc.peak += l.peak ?? 0;
          acc.rms += l.rms ?? 0
          return acc;
        }, { rms: 0, peak: 0 })
        this.updates.raiseEvent({
          type: 'audio-levels',
          levels: {
            peak: levels.channelLevels.length == 0 ? 0 : total.peak / levels.channelLevels.length,
            rms: levels.channelLevels.length == 0 ? 0 : total.rms / levels.channelLevels.length
          }
        })
      }
    });
    this.registerInput(this.whep);
    this.registerInput(this.audioLevels)
  }

  override subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts | undefined): void {
    void this.subscribeImpl(sources);
  }

  async subscribeImpl(sources: StudioNodeSubscriptionSource[]) {
    // can probably just have 's.hasMedia("video")'
    const videoSource = sources.filter((s) => s.streams.select.includes("video"))[0];
    const audioSource = sources.filter((s) => s.streams.select.includes("audio"))[0];

    if (!this.encoder) {
      debuglog("Finding preview encode for preview node", this.id);
      this.encoder = await this.shared.previewEncode(videoSource.selectVideo()[0], this.cfg.__global.hardware)
      this.registerInput(this.encoder);
    }

    // Audio into levels
    this.audioLevels?.subscribe(audioSource.selectAudio())

    const subscriptions: ReceiveFromAddressAuto[] = [{
      source: this.encoder,
      sourceSelector: selectVideo
    }];

    if (audioSource?.source.relatedMediaNodes.output) {
      subscriptions.push(audioSource.selectAudio()[0]);
    }

    // And then whep gets encoded + original audio
    this.whep?.subscribe(subscriptions, (ctx) => ctx.streams.length == subscriptions.length);
  }
}
