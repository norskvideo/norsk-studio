import {
  ChannelLayout, MediaNodeId
  , Norsk, SampleRate, StreamMetadata
  , StreamSwitchSmoothNode, VideoTestcardGeneratorNode, audioToPin, videoToPin, ReceiveFromAddress, SourceMediaNode, WhepOutputNode, requireAV, ReceiveFromAddressAuto, selectAudio, selectVideo,
  VideoComposeNode,
  StreamKeyOverrideNode,
  VideoComposeDefaults
} from '@norskvideo/norsk-sdk';

// should probably just re-implement this or...
import { SilenceSource } from '@norskvideo/norsk-studio-built-ins/lib/input.silence/runtime';
import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode, SubscriptionOpts } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { Context } from '@norskvideo/norsk-sdk';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { debuglog, warninglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, IceServer, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { webRtcSettings } from '@norskvideo/norsk-studio-built-ins/lib/shared/webrtcSettings'

export type SourceSwitchConfig = {
  id: MediaNodeId,
  displayName: string,
  resolution: { width: number, height: number },
  frameRate: { frames: number, seconds: number },
  sampleRate: SampleRate,
  channelLayout: ChannelLayout
  __global: {
    iceServers: IceServer[];
    hardware?: HardwareAccelerationType,
  }

  // Need an image uploaded
  // that'll need to live somewhere..
  // I guess we'll nominate a 'data' dir (although how Norsk itself is supposed to access that I don't know)
}

export type SourceSwitchState = {
  activeSource: SourceSwitchSource,
  availableSources: SourceSwitchSourceInfo[],
  knownSources: SourceSwitchSource[],
  previewPlayerUrl?: string,
  players: { source: SourceSwitchSource, player: string }[];
}


export type SourceSwitchSourceInfo = {
  resolution: { width: number, height: number },
  frameRate?: { frames: number, seconds: number },
  wentLiveAt: number;
} & SourceSwitchSource;

export type SourceSwitchSource = {
  id: string,
  key?: string
}

export type SourceSwitchEvent = {
  type: 'active-source-changed',
  activeSource: SourceSwitchSource
} | {
  type: 'source-online'
  source: SourceSwitchSourceInfo
} | {
  type: 'source-offline'
  source: SourceSwitchSource
} | {
  type: 'player-online',
  source: SourceSwitchSource,
  url: string
} | {
  type: 'preview-player-online',
  url: string
} | {
  type: 'sources-discovered',
  sources: SourceSwitchSource[],
};

type SourceSwitchOverlay = {
  source: SourceSwitchSource,
  x: number,
  y: number,
  width: number,
  height: number
}

export type SourceSwitchCommand = {
  type: 'select-source',
  source: SourceSwitchSource,
  overlays: SourceSwitchOverlay[]
}

export default class SourceSwitchDefinition implements ServerComponentDefinition<SourceSwitchConfig,
  SourceSwitch,
  SourceSwitchState,
  SourceSwitchCommand,
  SourceSwitchEvent> {
  async create(norsk: Norsk,
    cfg: SourceSwitchConfig,
    cb: OnCreated<SourceSwitch>,
    runtime: StudioRuntime<SourceSwitchState, SourceSwitchEvent>) {

    const updates = runtime.updates;

    const onActiveSourceChanged = (activeSource: SourceSwitchSource) => {
      updates.raiseEvent({ type: 'active-source-changed', activeSource });
    }

    const onSourceOnline = (source: SourceSwitchSourceInfo) => {
      updates.raiseEvent({ type: 'source-online', source });
    }

    const onPlayerOnline = ({ source, url }: { source: SourceSwitchSource, url: string }) => {
      updates.raiseEvent({ type: 'player-online', source, url });
    }

    const onSourceOffline = (source: SourceSwitchSource) => {
      updates.raiseEvent({ type: 'source-offline', source });
    }

    const onSourcesDiscovered = (sources: SourceSwitchSource[]) => {
      updates.raiseEvent({ type: 'sources-discovered', sources });
    }

    const cfgWithHooks = { onActiveSourceChanged, onSourcesDiscovered, onSourceOnline, onSourceOffline, onPlayerOnline, ...cfg };
    const node = new SourceSwitch(norsk, cfgWithHooks, runtime);
    await node.initialised;

    // Again, needs to hook a new whep event
    if (node.whepPreview?.endpointUrl)
      updates.raiseEvent({ type: 'preview-player-online', url: node.whepPreview?.endpointUrl })

    runtime.router.get("/status", (_req, res) => {
      const latest = updates.latest();
      const patched = {
        available: latest.availableSources.map((f) =>
        ({
          source: sourceSwitchSourceToPin(f),
          resolution: f.resolution,
          frameRate: f.frameRate,
          age: (new Date().valueOf() - f.wentLiveAt) / 1000.0
        })
        ),
        active: sourceSwitchSourceToPin(latest.activeSource)
      };
      res.send(JSON.stringify(patched))
    })

    runtime.router.post("/active", (req, res) => {
      const source = req.body.source;
      let fadeMs = req.body.fadeMs ?? 500;
      if (!source) {
        res.status(400).send("no source");
        return;
      }
      const latest = updates.latest();
      const converted = pinToSourceSwitchSource(source);
      const exists = latest.availableSources.find((s) => s.id == converted.id && s.key == converted.key)

      if (!exists) {
        res.status(400).send("source isn't active or doesn't exist");
        return;
      }

      if (typeof fadeMs === 'number') {
        if (fadeMs > 1000.0) {
          res.status(400).send("fadeMs too large");
          return;
        }
      } else {
        fadeMs = undefined;
      }
      node.setActiveSource(converted, []);
      res.send("ok");
    })

    cb(node);
  }
  handleCommand(node: SourceSwitch, command: SourceSwitchCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'select-source':
        node.setActiveSource(command.source, command.overlays);
        break;
      default:
        assertUnreachable(commandType);

    }
  }
}

//
// Everything below this line is Norsk only
//

type SourceSwitchConfigComplete = {
  onActiveSourceChanged: (source: SourceSwitchSource) => void,
  onSourceOnline: (source: SourceSwitchSourceInfo) => void,
  onSourceOffline: (source: SourceSwitchSource) => void,
  onSourcesDiscovered: (sources: SourceSwitchSource[]) => void,
  onPlayerOnline: (ev: { source: SourceSwitchSource, url: string }) => void,
} & SourceSwitchConfig

export class SourceSwitch extends CustomAutoDuplexNode {
  norsk: Norsk;
  cfg: SourceSwitchConfigComplete;
  audio?: SilenceSource;
  video?: VideoTestcardGeneratorNode;
  smooth?: StreamSwitchSmoothNode<string>;
  initialised: Promise<void>;
  activeSource: SourceSwitchSource = { id: '' };
  desiredSource: SourceSwitchSource = { id: '' };
  availableSources: SourceSwitchSource[] = [];
  lastSmoothSwitchContext: Map<string, StreamMetadata[]> = new Map();
  whepOutputs: Map<string, { whep: WhepOutputNode, encoder?: SourceMediaNode }> = new Map();
  encodePreview?: SourceMediaNode;
  whepPreview?: WhepOutputNode;
  subscriptions: StudioNodeSubscriptionSource[] = [];
  updates: RuntimeUpdates<SourceSwitchState, SourceSwitchEvent>;
  shared: StudioShared;

  composeCount: number = 0;
  pendingCompose?: { id: string, compose: VideoComposeNode<string>, output: StreamKeyOverrideNode, audio: StreamKeyOverrideNode };
  activeCompose?: { id: string, compose: VideoComposeNode<string>, output: StreamKeyOverrideNode, audio: StreamKeyOverrideNode };

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
      ...webRtcSettings(this.cfg.__global.iceServers),
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

  constructor(norsk: Norsk, cfg: SourceSwitchConfigComplete, runtime: StudioRuntime<SourceSwitchState, SourceSwitchEvent>) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
    this.updates = runtime.updates;
    this.shared = runtime.shared;
    this.initialised = this.initialise();
  }

  onTransitionComplete(pin: string) {
    debuglog("Transition complete", { id: this.id, source: this.activeSource })
    this.cfg.onActiveSourceChanged?.(this.activeSource);

    if (pin == this.pendingCompose?.id) {
      this.activeCompose = this.pendingCompose;
      this.pendingCompose = undefined;
      this.doSubscriptions();
    } else if (this.pendingCompose) {
      void this.pendingCompose.compose.close();
      void this.pendingCompose.output.close();
      this.pendingCompose = undefined;
    }
  }

  async onSwitchContext(allStreams: Map<string, StreamMetadata[]>) {
    this.lastSmoothSwitchContext = allStreams;
    await this.maybeSwitchSource();
  }

  setActiveSource(source: SourceSwitchSource, overlays: SourceSwitchOverlay[]) {
    if (!this.sourceIsAvailable(source)) return;

    // Quit this if we started
    if (this.pendingCompose) {
      void this.pendingCompose.compose.close();
      void this.pendingCompose.output.close();
      this.pendingCompose = undefined;
    }

    if (overlays.length > 0) {
      void this.setupComposeSource(source, overlays);
    } else {
      this.desiredSource = source;
      void this.maybeSwitchSource();
    }
  }

  async maybeSwitchSource() {
    const oldSources = this.availableSources;
    const allStreams = this.lastSmoothSwitchContext;

    this.availableSources = [...allStreams.keys()].map(pinToSourceSwitchSource);

    // Switch to desired source if available and not already done so
    if (this.activeSource.id !== this.desiredSource.id || this.activeSource.key != this.desiredSource.key) {
      const currentAvailable = this.sourceIsAvailable(this.desiredSource) && allStreams.get(sourceSwitchSourceToPin(this.desiredSource))?.length == 2;
      if (currentAvailable) {
        this.activeSource = this.desiredSource;
        this.smooth?.switchSource(sourceSwitchSourceToPin(this.desiredSource));
      }
    }

    // Switch to fallback if our desired source isn't available
    if (this.activeSource.id !== 'fallback') {
      const currentUnavailable = !this.sourceIsAvailable(this.desiredSource) || allStreams.get(sourceSwitchSourceToPin(this.desiredSource))?.length !== 2;
      const fallbackAvailable = this.sourceIsAvailable({ id: 'fallback' }) && allStreams.get(sourceSwitchSourceToPin({ id: 'fallback' }))?.length == 2;
      if (currentUnavailable && fallbackAvailable) {
        debuglog("Switching to fallback source", { id: this.id });
        if (this.desiredSource.id == this.activeSource.id && this.desiredSource.key == this.activeSource.key) {
          this.desiredSource = { id: 'fallback' };
        }
        this.activeSource = { id: 'fallback' };
        this.smooth?.switchSource("fallback")
      }
    }

    for (const existing of oldSources) {
      if (existing.id == this.pendingCompose?.id) continue;
      if (existing.id == this.activeCompose?.id) continue;

      const pin = sourceSwitchSourceToPin(existing);
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
      if (current.id == this.pendingCompose?.id) continue;
      if (current.id == this.activeCompose?.id) continue;

      const pin = sourceSwitchSourceToPin(current);
      if (!this.whepOutputs.get(pin) && allStreams.get(pin)?.length == 2) {
        debuglog("Source online", { id: this.id, source: current });

        const whep = await this.norsk.output.whep({
          id: `${this.id}-whep-${pin}`,
          ...webRtcSettings(this.cfg.__global.iceServers),
        })

        const streams = allStreams.get(pin);
        const video = streams?.find((f) => f.message.case == "video");

        if (video && video.message.case == "video") {
          this.whepOutputs.set(pin, { whep });
          this.cfg?.onSourceOnline({
            resolution: {
              width: video.message.value.width,
              height: video.message.value.height
            },
            frameRate: video.message.value.frameRate,
            wentLiveAt: new Date().valueOf(),
            ...current
          });
          this.cfg?.onPlayerOnline({ source: current, url: whep.endpointUrl });
        }

      }
    }
    void this.setupPreviewPlayers();
  }

  async setupComposeSource(source: SourceSwitchSource, overlays: SourceSwitchOverlay[]) {
    const id = `${this.id}-compose-${this.composeCount++}`;
    this.pendingCompose = {
      id,
      compose: await this.norsk.processor.transform.videoCompose<string>({
        id,
        outputResolution: this.cfg.resolution,
        referenceStream: 'background',
        missingStreamBehaviour: 'drop_part',
        parts: [
          {
            pin: "background",
            compose: VideoComposeDefaults.fullscreen(),
            opacity: 1.0,
            zIndex: 0
          },
          ...overlays.map((o, i) => {
            return {
              pin: `overlay-${i}`,
              compose: VideoComposeDefaults.fullscreen(),
              opacity: 1.0,
              zIndex: i + 1
            }
          })
        ]
      }),
      output: await this.norsk.processor.transform.streamKeyOverride({
        id: `${id}-video`,
        streamKey: {
          streamId: 256,
          programNumber: 1,
          sourceName: id,
          renditionName: 'default'
        }
      }),
      audio: await this.norsk.processor.transform.streamKeyOverride({
        id: `${id}-audio`,
        streamKey: {
          streamId: 257,
          programNumber: 1,
          sourceName: id,
          renditionName: 'default'
        }
      })
    };

    const background = this.subscriptions.find((s) => s.source.id == source.id);

    if (!background) {
      warninglog("Unable to find source for stream", { source });
      await this.pendingCompose.compose.close();
      await this.pendingCompose.output.close();
      this.pendingCompose = undefined;
      return;
    }

    this.pendingCompose.output.subscribe([
      { source: this.pendingCompose.compose, sourceSelector: selectVideo }
    ])

    // And the rest
    this.pendingCompose.compose.subscribeToPins([
      source.key ?
        background.selectVideoToPinForKey("background", source.key)[0] :
        background.selectVideoToPin("background")[0]
      , ...overlays.flatMap((o, i) => {
        const source = this.subscriptions.find((s) => s.source.id == o.source.id);
        if (!source) return [];
        return o.source.key ?
          [source.selectVideoToPinForKey(`overlay-${i}`, o.source.key)[0]] :
          [source.selectVideoToPin(`overlay-${i}`)[0]];
      })])

    // This could be a mixer..
    this.pendingCompose.audio.subscribe([
      source.key ?
        background.selectAudioForKey(source.key)[0] :
        background.selectAudio()[0]
    ])
    this.desiredSource = { id: `${this.pendingCompose.id}` };
    this.doSubscriptions();
  }

  sourceIsAvailable(source: SourceSwitchSource) {
    return !!this.availableSources.find((s) => s.id == source.id && s.key == source.key);
  }

  override subscribe(subs: StudioNodeSubscriptionSource[], opts?: SubscriptionOpts) {
    this.subscriptions = subs;
    this.doSubscriptions(opts);
    void this.setupPreviewPlayers();
  }

  doSubscriptions(opts?: SubscriptionOpts) {
    const knownSources: SourceSwitchSource[] = [];
    const subs = this.subscriptions;

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
        { source: this.video, sourceSelector: videoToPin("fallback") }
      );
      knownSources.push({ id: "fallback" });
    }

    this.cfg.onSourcesDiscovered(knownSources);

    if (this.pendingCompose) {
      subscriptions.push({
        source: this.pendingCompose.output,
        sourceSelector: videoToPin(`${this.pendingCompose.id}`)
      })
      subscriptions.push({
        source: this.pendingCompose.audio,
        sourceSelector: audioToPin(`${this.pendingCompose.id}`)
      })
    }

    if (this.activeCompose) {
      subscriptions.push({
        source: this.activeCompose.output,
        sourceSelector: videoToPin(`${this.activeCompose.id}`)
      })
      subscriptions.push({
        source: this.activeCompose.audio,
        sourceSelector: audioToPin(`${this.activeCompose.id}`)
      })
    }

    debuglog("Subcription complete, known sources", { id: this.id, knownSources });

    this.smooth?.subscribeToPins(subscriptions, opts?.requireOneOfEverything ? (ctx: Context) => ctx.streams.length == (subs.length * 2) + 2 : undefined);
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

function pinToSourceSwitchSource(pin: string): SourceSwitchSource {
  const [id, key] = pinToSourceAndKey(pin);
  return { id, key };
}

function sourceSwitchSourceToPin(source: SourceSwitchSource) {
  return pinName(source.id, source.key);
}
