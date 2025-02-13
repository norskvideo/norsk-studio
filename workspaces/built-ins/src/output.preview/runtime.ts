import {
  AudioMeasureLevels, AudioMeasureLevelsNode, ImagePreviewOutputNode, Norsk,
  ReceiveFromAddressAuto, WhepOutputSettings as SdkSettings, SourceMediaNode, WhepOutputNode, selectVideo
} from '@norskvideo/norsk-sdk';
import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SimpleSinkWrapper, SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { HardwareAccelerationType, IceServer } from '@norskvideo/norsk-studio/lib/shared/config';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { webRtcSettings } from '../shared/webrtcSettings';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';

export type PreviewMode = 'video_passthrough' | 'video_encode' | 'image';

export type PreviewOutputSettings = {
  id: string;
  displayName: string,
  notes?: string,
  bufferDelayMs?: SdkSettings['bufferDelayMs'],
  previewMode: PreviewMode;
  showPreview?: boolean,
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
  images?: ImagePreviewOutputNode;
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


    // Common in all cases
    if (audioSource) {
      // Audio into levels
      this.audioLevels?.subscribe(audioSource)
    } else {
      this.audioLevels?.subscribe([])
    }


    switch (this.cfg.previewMode) {
      case 'video_passthrough': {
        debuglog("Setting up preview node in passthrough mode", { id: this.id });
        this.encoder = undefined;
        const subscriptions: ReceiveFromAddressAuto[] = [];
        if (videoSource?.[0])
          subscriptions.push(videoSource[0]);
        if (audioSource?.[0])
          subscriptions.push(audioSource[0]);
        await this.setupWhep(subscriptions);
        break;
      }
      case 'video_encode': {
        debuglog("Setting up preview node in encode mode", { id: this.id });
        const subscriptions: ReceiveFromAddressAuto[] = [];
        if (!this.encoder && videoSource?.[0]) {
          debuglog("Fetching encode for preview", { id: this.id, acceleration: this.cfg.__global.hardware });
          this.encoder = await this.shared.previewEncode(
            videoSource[0],
            this.cfg.__global.hardware,
            {
              width: 320,
              height: 180,
              preset: 'ultrafast',
            }
          );
          this.registerInput(this.encoder);
          subscriptions.push({
            source: this.encoder,
            sourceSelector: selectVideo
          });
        }
        if (audioSource?.[0])
          subscriptions.push(audioSource[0]);
        await this.setupWhep(subscriptions);
        break;
      }
      case 'image': {
        debuglog("Setting up preview node in image mode", { id: this.id });
        if (!videoSource?.[0])
          return;
        const stream = videoSource[0].source.outputStreams[0].message;
        if (!stream) return
        if (stream.case != 'video') return;
        const fr = stream.value.frameRate ?? { frames: 25, seconds: 1 };
        // once a second
        const frequency = Math.floor(fr.frames / fr.seconds);
        if (!this.images) {
          this.images = await this.norsk.output.imagePreview({
            id: `${this.id}-image-preview`,
            frequency,
            keep: 10,
            resolution: { width: 320, height: 180 },
            quality: 80,
            onImagePublished: (f) => {
              this.updates.raiseEvent({
                type: 'url-published',
                url: this.images?.baseUrl + f
              })
            }
          })
          this.images.subscribe([videoSource[0]])
        }
        break;
      }
    }

  }
  async setupWhep(subscriptions: ReceiveFromAddressAuto[]) {
    const whepCfg: SdkSettings = {
      id: `${this.cfg.id}-whep`,
      bufferDelayMs: this.cfg.bufferDelayMs,
      onPublishStart: () => {
        const url = this.whep?.endpointUrl;
        if (url) {
          debuglog("WHEP Now has an endpoint", { id: this.id, url });
          this.updates.raiseEvent({ type: 'url-published', url })
        }

      },
      ...webRtcSettings(this.cfg.__global.iceServers)
    };

    if (subscriptions.length > 0) {
      // In theory this can work for audio only or video only workflows
      if (!this.whep) {
        debuglog("Creating WHEP output for preview", { id: this.id });
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
    // I don't know why we do/did this ???
    // Okay, it doesn't look like onPublishStart is anything like what we want (above)
    if (this.whep?.endpointUrl && !this.updates.latest().url) {
      this.updates.raiseEvent({ type: 'url-published', url: this.whep?.endpointUrl })
    }
  }
}
