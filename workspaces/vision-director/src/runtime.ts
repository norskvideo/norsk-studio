import {
  ChannelLayout, MediaNodeId
  , Norsk, SampleRate, StreamMetadata
  , StreamSwitchSmoothNode, VideoTestcardGeneratorNode, audioToPin, videoToPin, ReceiveFromAddress, SourceMediaNode, WhepOutputNode, requireAV, ReceiveFromAddressAuto, selectAudio, selectVideo,
} from '@norskvideo/norsk-sdk';

// should probably just re-implement this or... 
import { SilenceSource } from 'norsk-studio.built-ins/lib/input.silence/runtime';
import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from 'norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode, SubscriptionOpts } from "norsk-studio/lib/extension/base-nodes";
import { Context } from '@norskvideo/norsk-sdk';
import { assertUnreachable } from 'norsk-studio/lib/shared/util';
import { debuglog } from 'norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from 'norsk-studio/lib/shared/config';

export type MultiCameraSelectConfig = {
  id: MediaNodeId,
  displayName: string,
  resolution: { width: number, height: number },
  frameRate: { frames: number, seconds: number },
  sampleRate: SampleRate,
  channelLayout: ChannelLayout
  __global: {
    iceServers: string[];
    hardware?: HardwareAccelerationType,
  }

  // Need an image uploaded
  // that'll need to live somewhere..
  // I guess we'll nominate a 'data' dir (although how Norsk itself is supposed to access that I don't know)
}

export type MultiCameraSelectState = {
  activeSource: MultiCameraSource,
  availableSources: MultiCameraSource[],
  knownSources: MultiCameraSource[],
  previewPlayerUrl?: string,
  players: { source: MultiCameraSource, player: string }[];
}

export type MultiCameraSource = {
  id: string,
  key?: string
}

export type MultiCameraSelectEvent = {
  type: 'active-source-changed',
  activeSource: MultiCameraSource
} | {
  type: 'source-online'
  source: MultiCameraSource
} | {
  type: 'source-offline'
  source: MultiCameraSource
} | {
  type: 'player-online',
  source: MultiCameraSource,
  url: string
} | {
  type: 'preview-player-online',
  url: string
} | {
  type: 'sources-discovered',
  sources: MultiCameraSource[],
};

export type MultiCameraSelectCommand = {
  type: 'select-source',
  source: MultiCameraSource
}

export default class MultiCameraSelectDefinition implements ServerComponentDefinition<MultiCameraSelectConfig,
  MultiCameraSelect,
  MultiCameraSelectState,
  MultiCameraSelectCommand,
  MultiCameraSelectEvent> {
  async create(norsk: Norsk,
    cfg: MultiCameraSelectConfig,
    cb: OnCreated<MultiCameraSelect>,
    runtime: StudioRuntime<MultiCameraSelectState, MultiCameraSelectEvent>) {

    const updates = runtime.updates;

    const onActiveSourceChanged = (activeSource: MultiCameraSource) => {
      updates.raiseEvent({ type: 'active-source-changed', activeSource });
    }

    const onSourceOnline = (source: MultiCameraSource) => {
      updates.raiseEvent({ type: 'source-online', source });
    }

    const onPlayerOnline = ({ source, url }: { source: MultiCameraSource, url: string }) => {
      updates.raiseEvent({ type: 'player-online', source, url });
    }

    const onSourceOffline = (source: MultiCameraSource) => {
      updates.raiseEvent({ type: 'source-offline', source });
    }

    const onSourcesDiscovered = (sources: MultiCameraSource[]) => {
      updates.raiseEvent({ type: 'sources-discovered', sources });
    }

    const cfgWithHooks = { onActiveSourceChanged, onSourcesDiscovered, onSourceOnline, onSourceOffline, onPlayerOnline, ...cfg };
    const node = new MultiCameraSelect(norsk, cfgWithHooks, runtime);
    await node.initialised;

    // Again, needs to hook a new whep event
    if (node.whepPreview?.endpointUrl)
      updates.raiseEvent({ type: 'preview-player-online', url: node.whepPreview?.endpointUrl })

    cb(node);
  }
  handleCommand(node: MultiCameraSelect, command: MultiCameraSelectCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'select-source':
        node.setActiveSource(command.source);
        break;
      default:
        assertUnreachable(commandType);

    }
  }
}

//
// Everything below this line is Norsk only
//

type MultiCameraSelectConfigComplete = {
  onActiveSourceChanged: (source: MultiCameraSource) => void,
  onSourceOnline: (source: MultiCameraSource) => void,
  onSourceOffline: (source: MultiCameraSource) => void,
  onSourcesDiscovered: (sources: MultiCameraSource[]) => void,
  onPlayerOnline: (ev: { source: MultiCameraSource, url: string }) => void,
} & MultiCameraSelectConfig

export class MultiCameraSelect extends CustomAutoDuplexNode {
  norsk: Norsk;
  cfg: MultiCameraSelectConfigComplete;
  audio?: SilenceSource;
  video?: VideoTestcardGeneratorNode;
  smooth?: StreamSwitchSmoothNode<string>;
  initialised: Promise<void>;
  activeSource: MultiCameraSource = { id: '' };
  availableSources: MultiCameraSource[] = [];
  whepOutputs: Map<string, { whep: WhepOutputNode, encoder?: SourceMediaNode }> = new Map();
  encodePreview?: SourceMediaNode;
  whepPreview?: WhepOutputNode;
  subscriptions: StudioNodeSubscriptionSource[] = [];
  updates: RuntimeUpdates<MultiCameraSelectState, MultiCameraSelectEvent>;
  shared: StudioShared;

  async initialise() {
    const audio = await SilenceSource.create(this.norsk,
      {
        id: `${this.cfg.id}-audio-silence`,
        displayName: `${this.cfg.id}-audio-silence`,
        channelLayout: this.cfg.channelLayout,
        sampleRate: this.cfg.sampleRate,
      });
    const video = await this.norsk.input.videoTestCard({
      id: `${this.cfg.id}-video-card`,
      sourceName: 'video-card',
      resolution: this.cfg.resolution,
      frameRate: this.cfg.frameRate,
      pattern: 'black',
    });

    // and a source switch node
    const smooth = await this.norsk.processor.control.streamSwitchSmooth({
      id: `${this.cfg.id}-switch`,
      outputSource: "output",
      activeSource: "fallback",
      outputResolution: this.cfg.resolution,
      frameRate: this.cfg.frameRate,
      alignment: "aligned",
      sampleRate: this.cfg.sampleRate,
      channelLayout: this.cfg.channelLayout,
      onInboundContextChange: this.onSwitchContext.bind(this),
      onTransitionComplete: this.onTransitionComplete.bind(this),
      hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ['quadra', 'nvidia'])
    });

    this.encodePreview = await this.shared.previewEncode({ source: smooth, sourceSelector: selectVideo }, this.cfg.__global.hardware)

    this.whepPreview = await this.norsk.output.whep({
      id: `${this.cfg.id}-preview`,
      iceServers: this.cfg.__global.iceServers.map((s) => ({ urls: [s] })), // not sure about turn
    });

    this.whepPreview?.subscribe([{
      source: this.encodePreview,
      sourceSelector: selectVideo
    },
    {
      source: smooth,
      sourceSelector: selectAudio
    }], requireAV);

    {
      let prev = 0.0;
      let lastDiff = 0.0;
      const debug = await this.norsk.debug.streamTimestampReport({
        onTimestamp: async (_, t) => {
          const now = Number((t.n * 100n) / t.d) / 100;
          const diff = now - prev;
          if (Math.abs(lastDiff - diff) > 0.01)
            debuglog('ABNORMAL AUDIO GAP DETECTED', { gap: now - prev, lastGap: lastDiff });
          prev = now;
          lastDiff = diff;
        }
      });

      debug.subscribe([
        { source: smooth, sourceSelector: selectAudio }
      ])
    }

    {
      let prev = 0.0;
      let lastDiff = 0.0;
      const debug = await this.norsk.debug.streamTimestampReport({
        onTimestamp: async (_, t) => {
          const now = Number((t.n * 100n) / t.d) / 100;
          const diff = now - prev;
          if (Math.abs(lastDiff - diff) > 0.01)
            debuglog('ABNORMAL VIDEO GAP DETECTED', { gap: now - prev, lastGap: lastDiff });
          prev = now;
          lastDiff = diff;
        }
      });

      debug.subscribe([
        { source: smooth, sourceSelector: selectVideo }
      ])
    }

    this.audio = audio;
    this.video = video;
    this.smooth = smooth;
    this.setup({ input: smooth, output: [smooth] });
    this.subscribe([]);
  }

  constructor(norsk: Norsk, cfg: MultiCameraSelectConfigComplete, runtime: StudioRuntime<MultiCameraSelectState, MultiCameraSelectEvent>) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
    this.updates = runtime.updates;
    this.shared = runtime.shared;
    this.initialised = this.initialise();
  }

  onTransitionComplete() {
    debuglog("Transition complete", { id: this.id, source: this.activeSource })
    this.cfg.onActiveSourceChanged?.(this.activeSource);
  }

  async onSwitchContext(allStreams: Map<string, StreamMetadata[]>) {
    const oldSources = this.availableSources;

    this.availableSources = [...allStreams.keys()].map(pinToMultiCameraSource);

    // Fallback if our active source goes away
    // We could be smarter and keep a list of recent transitions and go back to something recent
    // but that starts to smell like business logic
    // oh and don't switch to fallback until it exists because that doesn't work either
    if (this.activeSource.id !== 'fallback') {
      const currentUnavailable = !this.sourceIsAvailable(this.activeSource) || allStreams.get(multiCameraSourceToPin(this.activeSource))?.length !== 2;
      const fallbackAvailable = this.sourceIsAvailable({ id: 'fallback' }) && allStreams.get(multiCameraSourceToPin({ id: 'fallback' }))?.length == 2;
      if (currentUnavailable && fallbackAvailable) {
        debuglog("Switching to fallback source", { id: this.id });
        this.activeSource = { id: 'fallback' };
        this.smooth?.switchSource("fallback")
      }
    }

    for (const existing of oldSources) {
      const pin = multiCameraSourceToPin(existing);
      if (!this.sourceIsAvailable(existing) || allStreams.get(pin)?.length == 0) {
        const player = this.whepOutputs.get(pin);
        if (player) {
          debuglog("Source offline", { id: this.id, source: existing });
          this.whepOutputs.delete(pin);
          await player.whep.close();
          // return it?
          // await player.encoder.close();
          this.cfg?.onSourceOffline(existing);
        }
      }
    }

    for (const current of this.availableSources) {
      const pin = multiCameraSourceToPin(current);
      if (!this.whepOutputs.get(pin) && allStreams.get(pin)?.length == 2) {
        debuglog("Source online", { id: this.id, source: current });

        const whep = await this.norsk.output.whep({
          id: `${this.id}-whep-${pin}`,
          iceServers: this.cfg.__global.iceServers.map((s) => ({ urls: [s] })), // not sure about turn
        })

        this.whepOutputs.set(pin, { whep });
        // We need to add an event to WHEP for 'I've started my deferred workflow'
        this.cfg?.onSourceOnline(current);
        this.cfg?.onPlayerOnline({ source: current, url: whep.endpointUrl });
      }
    }
    void this.setupPreviewPlayers();
  }

  setActiveSource(source: MultiCameraSource) {
    if (this.activeSource.id === source.id && this.activeSource.key == source.key) return;
    if (!this.sourceIsAvailable(source)) return;

    this.smooth?.switchSource(multiCameraSourceToPin(source));
    this.activeSource = source;
  }


  sourceIsAvailable(source: MultiCameraSource) {
    return !!this.availableSources.find((s) => s.id == source.id && s.key == source.key);
  }


  override subscribe(subs: StudioNodeSubscriptionSource[], opts?: SubscriptionOpts) {
    const knownSources: MultiCameraSource[] = [];

    const subscriptions = subs.flatMap((s) => {
      const sType = s.streams.type;
      switch (sType) {
        case 'take-all-streams':
          // If it's not a fixed list source  // then this will be an empty list, no harm done
          return s.activeSourceKeys().flatMap((key) => {
            knownSources.push({ id: s.source.id });
            return s.selectAvToPinForKey(pinName(s.source.id, key), key);
          })
        case 'take-first-stream':
          // There is only one, we don't care what it is, we can
          // just do the subscription and tag it with the id
          knownSources.push({ id: s.source.id });
          return s.selectAvToPin(pinName(s.source.id))
        case 'take-specific-stream':
          knownSources.push({ id: s.source.id });
          return s.selectAvToPin((pinName(s.source.id)))
        case 'take-specific-streams':
          return s.activeSourceKeys().flatMap((key) => {
            knownSources.push({ id: s.source.id, key });
            return s.selectAvToPinForKey(pinName(s.source.id, key), key);
          })
        default:
          assertUnreachable(sType);
      }
    }).filter((x): x is ReceiveFromAddress<string> => !!x) ?? [];

    if (this.audio)
      subscriptions.push(
        { source: (this.audio.relatedMediaNodes.output[0]) as SourceMediaNode, sourceSelector: audioToPin("fallback") }
      );
    if (this.video) {
      subscriptions.push(
        {
          source: this.video, sourceSelector: videoToPin("fallback")
        }
      );
      knownSources.push({ id: "fallback" });
    }

    this.cfg.onSourcesDiscovered(knownSources);

    debuglog("Subcription complete, known sources", { id: this.id, knownSources });

    this.smooth?.subscribeToPins(subscriptions, opts?.requireOneOfEverything ? (ctx: Context) => ctx.streams.length == (subs.length * 2) + 2 : undefined);

    this.subscriptions = subs;
    void this.setupPreviewPlayers();
  }

  async setupPreviewPlayers() {
    // And the preview players
    for (const [active, player] of this.whepOutputs) {
      const [id, key] = pinToSourceAndKey(active);
      // This is a bit more involved now
      const source = this.subscriptions.find((s) => s.source.id == id);
      if (!player) continue;

      if (active === "fallback") {
        const subscriptions: ReceiveFromAddressAuto[] = [];

        if (this.audio)
          subscriptions.push(
            { source: (this.audio.relatedMediaNodes.output[0]) as SourceMediaNode, sourceSelector: selectAudio }
          );
        if (this.video) {
          if (!player.encoder) {
            player.encoder = await this.shared.previewEncode({ source: this.video, sourceSelector: selectVideo }, this.cfg.__global.hardware)
          }
          subscriptions.push(
            { source: player.encoder, sourceSelector: selectVideo }
          );
        }
        player.whep.subscribe(subscriptions);

      } else {
        if (!source) continue;

        if (!player.encoder) {
          player.encoder = await this.shared.previewEncode(key ? source.selectVideoForKey(key)[0] : source.selectVideo()[0], this.cfg.__global.hardware)
        }

        player.whep.subscribe(
          (key ? source.selectAudioForKey(key) : source.selectAudio()).concat([
            { source: player.encoder, sourceSelector: selectVideo }
          ])
        )

      }
    }
  }


  override async close() {
    await super.close();
    await this.audio?.close();
    await this.video?.close();
  }
}
function pinName(sourceId: string, key?: string) {
  if (key) {
    return `${sourceId}__${key}`;
  } else {
    return sourceId;
  }
}

function pinToSourceAndKey(pin: string): [string, string | undefined] {
  if (pin.indexOf('__') >= 0) {
    const result = pin.split('__', 2);
    return [result[0], result[1]];
  }
  return [pin, undefined];
}

function pinToMultiCameraSource(pin: string): MultiCameraSource {
  const [id, key] = pinToSourceAndKey(pin);
  return { id, key };
}

function multiCameraSourceToPin(source: MultiCameraSource) {
  return pinName(source.id, source.key);
}
