import {
  AudioMeasureLevels, AudioMeasureLevelsNode, Norsk,
  ReceiveFromAddressAuto, WhepOutputSettings as SdkSettings, SourceMediaNode, WhepOutputNode, selectVideo
} from '@norskvideo/norsk-sdk';
import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SimpleSinkWrapper, SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { HardwareAccelerationType, IceServer } from '@norskvideo/norsk-studio/lib/shared/config';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { webRtcSettings } from '../shared/webrtcSettings';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';

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
  async create(norsk: Norsk, cfg: PreviewOutputSettings, cb: OnCreated<SimpleSinkWrapper>, runtime: StudioRuntime<PreviewOutputState, PreviewOutputCommand, PreviewOutputEvent>) {
    const node = new PreviewOutput(norsk, runtime, cfg);
    await node.initialised;
    cb(node);
  }
}

export class PreviewOutput extends CustomSinkNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<PreviewOutputState, PreviewOutputCommand, PreviewOutputEvent>;
  shared: StudioShared;

  cfg: PreviewOutputSettings;
  encoder?: SourceMediaNode;
  whep?: WhepOutputNode;
  audioLevels?: AudioMeasureLevelsNode;
  context: ContextPromiseControl = new ContextPromiseControl(this.subscribeImpl.bind(this));

  constructor(norsk: Norsk, { updates, shared }: StudioRuntime<PreviewOutputState, PreviewOutputCommand, PreviewOutputEvent>, cfg: PreviewOutputSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.shared = shared;
    this.initialised = this.initialise();
  }

  async initialise() {
    
    this.audioLevels = await this.norsk.processor.control.audioMeasureLevels({
      id: `${this.cfg.id}-audiolevels`,
      onData: (levels: AudioMeasureLevels) => {
        const total = levels.channelLevels.reduce<{ rms: number, peak: number }>((acc, l) => {
          acc.peak += l.peak ?? -90;
          acc.rms += l.rms ?? -90
          return acc;
        }, { rms: -90, peak: -90 })
        this.updates.raiseEvent({
          type: 'audio-levels',
          levels: {
            peak: levels.channelLevels.length == 0 ? -90 : total.peak / levels.channelLevels.length,
            rms: levels.channelLevels.length == 0 ? -90 : total.rms / levels.channelLevels.length
          }
        })
      }
    });
    this.registerInput(this.audioLevels)
  }

  override subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts | undefined): void {
    this.context.setSources(sources);
  }

  async subscribeImpl(sources: StudioNodeSubscriptionSource[]) {
    // can probably just have 's.hasMedia("video")'
    const videoSource = sources.filter((s) => s.streams.select.includes("video")).at(0)?.selectVideo();
    const audioSource = sources.filter((s) => s.streams.select.includes("audio")).at(0)?.selectAudio();

    if (videoSource && videoSource.length > 0) {
      if (!this.encoder) {
        debuglog("Finding preview encode for preview node", this.id);
        this.encoder = await this.shared.previewEncode(videoSource[0], this.cfg.__global.hardware);
        this.registerInput(this.encoder);
      }
    } else {
      this.encoder = undefined;
    }

    if (audioSource) {
      // Audio into levels
      this.audioLevels?.subscribe(audioSource)
    } else {
      this.audioLevels?.subscribe([])
    }

    const subscriptions: ReceiveFromAddressAuto[] = [];

    if (this.encoder) {
      subscriptions.push({
        source: this.encoder,
        sourceSelector: selectVideo
      });
    }

    if (audioSource && audioSource.length > 0) {
      subscriptions.push(audioSource[0]);
    }

    const whepCfg: SdkSettings = {
      id: `${this.cfg.id}-whep`,
      bufferDelayMs: this.cfg.bufferDelayMs,
      onPublishStart: () => {
        const url = this.whep?.endpointUrl;
        if (url) {
          this.updates.raiseEvent({ type: 'url-published', url })
        }

      },
      ...webRtcSettings(this.cfg.__global.iceServers)
    };

    if (subscriptions.length > 0) {
      // In theory this can work for audio only or video only workflows
      if (!this.whep) {
        this.whep = await this.norsk.output.whep(whepCfg);
      }

      // And then whep gets encoded + original audio
      this.whep?.subscribe(subscriptions, (ctx) => {
        return ctx.streams.length == subscriptions.length
      });
    }

    if (subscriptions.length == 0) {
      await this.whep?.close();
      this.whep = undefined;
      this.updates.update({})
    }
    if (subscriptions.length > 0 && !audioSource) {
      this.updates.update({ url: this.whep?.endpointUrl })
    }
  }
}
