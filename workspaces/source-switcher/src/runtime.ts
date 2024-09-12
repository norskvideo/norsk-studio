import {
  ChannelLayout, MediaNodeId
  , Norsk, SampleRate, StreamMetadata
  , StreamSwitchSmoothNode, VideoTestcardGeneratorNode, audioToPin, videoToPin, ReceiveFromAddress, SourceMediaNode, WhepOutputNode, requireAV, ReceiveFromAddressAuto, selectAudio, selectVideo,
  VideoComposeNode,
  StreamKeyOverrideNode,
  VideoComposeDefaults,
  ComposePart
} from '@norskvideo/norsk-sdk';

import { SilenceSource } from '@norskvideo/norsk-studio-built-ins/lib/input.silence/runtime';
import { InstanceRouteInfo, OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode, SubscriptionOpts } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import path from 'path';
import fs from 'fs/promises';
import YAML from 'yaml';
import { Context } from '@norskvideo/norsk-sdk';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { Request, Response } from 'express';
import { debuglog, warninglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, IceServer, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { webRtcSettings } from '@norskvideo/norsk-studio-built-ins/lib/shared/webrtcSettings'
import { components } from './types';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';

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
  // that'll need to live in the global data dir
}

export type SourceSwitchState = {
  activeSource: SourceSwitchSource,
  activeOverlays: SourceSwitchOverlay[],
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
  activeSource: SourceSwitchSource,
  overlays: SourceSwitchOverlay[]
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


export type SourceSwitchRect = {
  x: number,
  y: number,
  width: number,
  height: number
}

export type SourceSwitchOverlay = {
  source: SourceSwitchSource,
  sourceRect?: SourceSwitchRect,
  destRect?: SourceSwitchRect,
}

export type SourceSwitchCommand = {
  type: 'select-source',
  source: SourceSwitchSource,
  overlays: SourceSwitchOverlay[]
}

// HTTP API
export type SourceSwitchHttpStreamId = components['schemas']['stream'];
export type SourceSwitchHttpSource = components['schemas']['active-source'];
export type SourceSwitchHttpOverlay = components['schemas']['overlay'];
export type SourceSwitchHttpStatus = components['schemas']['status'];
export type SourceSwitchHttpTransition = components['schemas']['transition'];
export type SourceSwitchHttpUpdate = components['schemas']['status-update'];


export default class SourceSwitchDefinition implements ServerComponentDefinition<SourceSwitchConfig,
  SourceSwitch,
  SourceSwitchState,
  SourceSwitchCommand,
  SourceSwitchEvent> {
  async create(norsk: Norsk,
    cfg: SourceSwitchConfig,
    cb: OnCreated<SourceSwitch>,
    runtime: StudioRuntime<SourceSwitchState, SourceSwitchCommand, SourceSwitchEvent>) {

    const updates = runtime.updates;

    const onActiveSourceChanged = (source: SourceSwitchSource, overlays: SourceSwitchOverlay[]) => {
      updates.raiseEvent({ type: 'active-source-changed', activeSource: source, overlays });
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

  async instanceRoutes(): Promise<InstanceRouteInfo<SourceSwitchConfig, SourceSwitch, SourceSwitchState, SourceSwitchCommand, SourceSwitchEvent>[]> {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);

    return [
      {
        url: '/status',
        method: 'GET',
        handler: ({ runtime: { updates } }) => ((_req: Request, res: Response) => {
          const { availableSources, activeOverlays, activeSource } = updates.latest();
          const value: SourceSwitchHttpStatus = {
            available: availableSources.map((f) =>
            ({
              source: sourceSwitchSourceToPin(f),
              resolution: f.resolution,
              frameRate: f.frameRate,
              age: (new Date().valueOf() - f.wentLiveAt) / 1000.0
            })),
            active: {
              primary: sourceSwitchSourceToPin(activeSource),
              overlays: activeOverlays.map((o) => ({
                sourceRect: o.sourceRect,
                destRect: o.destRect,
                source: sourceSwitchSourceToPin(o.source)
              }))
            }
          };
          res.json(value);
        }),
        responses: {
          '200': {
            description: "Information about the presently active source and any configured overlays",
            content: {
              "application/json": {
                schema: resolved.components!.schemas!['status']
              },
            }
          }
        }
      },
      {
        url: '/active',
        method: 'POST',
        handler: ({ runtime: { updates } }) => ((req, res) => {
          const update: Partial<SourceSwitchHttpUpdate> = req.body;
          const primary = update.primary;

          if (!primary) {
            res.status(400).send(`Source ${primary} does not exist`);
            return;
          }

          const latest = updates.latest();
          const converted = pinToSourceSwitchSource(primary);
          const exists = latest.availableSources.find((s) => s.id == converted.id && s.key == converted.key)

          const overlays = update.overlays?.map((o): SourceSwitchOverlay => {
            const convertedSource = pinToSourceSwitchSource(o.source);
            return {
              source: convertedSource,
              sourceRect: o.sourceRect,
              destRect: o.destRect,
            };
          });

          if (!exists) {
            res.status(400).send("source isn't active or doesn't exist");
            return;
          }
          if (overlays?.reduce((a, o) => {
            if (a) return a;
            const exists = latest.availableSources.find((s) => s.id == o.source.id && s.key == o.source.key)
            if (!exists) {
              res.status(400).send(`overlay ${sourceSwitchSourceToPin(o.source)} isn't active or doesn't exist`);
            }
            return !exists;
          }, false)) return;


          if (typeof update.transition?.durationMs === 'number') {
            if (update.transition.durationMs > 10000.0) {
              res.status(400).send("fadeMs too large");
              return;
            }
          } else {
            if (update.transition)
              update.transition.durationMs = 0;
          }

          // TODO: Add the actual transition support
          updates.sendCommand({
            type: 'select-source',
            source: converted,
            overlays: overlays ?? []
          })
          res.send("ok");
        }),
        requestBody: {
          description: "The new primary source and any overlays required on it",
          content: {
            "application/json": {
              schema: resolved.components!.schemas!['status-update']
            },
          }
        },
        responses: {
          '200': {
            description: "The update was requested successfully, and will be applied in due course"
          },
          '400': {
            description: "There was a problem with the request"
          }
        }
      }
    ]
  }
}


//
// Everything below this line is Norsk only
//

type SourceSwitchConfigComplete = {
  onActiveSourceChanged: (source: SourceSwitchSource, overlays: SourceSwitchOverlay[]) => void,
  onSourceOnline: (source: SourceSwitchSourceInfo) => void,
  onSourceOffline: (source: SourceSwitchSource) => void,
  onSourcesDiscovered: (sources: SourceSwitchSource[]) => void,
  onPlayerOnline: (ev: { source: SourceSwitchSource, url: string }) => void,
} & SourceSwitchConfig

type InternalSource = { pin: string, primary: SourceSwitchSource, overlays: SourceSwitchOverlay[] }

export class SourceSwitch extends CustomAutoDuplexNode {
  norsk: Norsk;
  cfg: SourceSwitchConfigComplete;
  audio?: SilenceSource;
  video?: VideoTestcardGeneratorNode;
  smooth?: StreamSwitchSmoothNode<string>;
  initialised: Promise<void>;
  activeSource: InternalSource = { pin: '', primary: { id: '' }, overlays: [] };
  desiredSource: InternalSource = this.activeSource;
  pendingSource: InternalSource = this.activeSource;
  availableSources: SourceSwitchSource[] = [];
  lastSmoothSwitchContext: Map<string, StreamMetadata[]> = new Map();
  whepOutputs: Map<string, { whep: WhepOutputNode, encoder?: SourceMediaNode }> = new Map();
  encodePreview?: SourceMediaNode;
  whepPreview?: WhepOutputNode;
  subscriptions: StudioNodeSubscriptionSource[] = [];
  overlayInputs: StreamKeyOverrideNode[] = [];
  updates: RuntimeUpdates<SourceSwitchState, SourceSwitchCommand, SourceSwitchEvent>;
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

  constructor(norsk: Norsk, cfg: SourceSwitchConfigComplete, runtime: StudioRuntime<SourceSwitchState, SourceSwitchCommand, SourceSwitchEvent>) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
    this.updates = runtime.updates;
    this.shared = runtime.shared;
    this.initialised = this.initialise();
  }

  onTransitionComplete(pin: string) {
    debuglog("Transition complete", { id: this.id, source: this.activeSource, pin })
    if (pin == this.pendingCompose?.id) {
      if (this.activeCompose) {
        void this.activeCompose.compose.close();
        void this.activeCompose.output.close();
      }
      this.activeCompose = this.pendingCompose;
      this.pendingCompose = undefined;
      this.doSubscriptions();

      // We shouldn't end up here but..
    } else if (this.pendingCompose) {
      void this.pendingCompose.compose.close();
      void this.pendingCompose.output.close();
      this.pendingCompose = undefined;
    }
    // Effectively unlocking things for change again
    this.activeSource = this.desiredSource;
    this.cfg.onActiveSourceChanged?.(this.activeSource.primary, this.activeSource.overlays);
  }

  async onSwitchContext(allStreams: Map<string, StreamMetadata[]>) {
    this.lastSmoothSwitchContext = allStreams;
    await this.maybeSwitchSource();
  }

  setActiveSource(source: SourceSwitchSource, overlays: SourceSwitchOverlay[]) {
    debuglog("Request to switch source registered", { id: this.cfg.id, source });

    if (!this.sourceIsAvailable(source)) {
      warninglog("Request to switch source ignored because it doesn't exist", { id: this.cfg.id, source, available: this.availableSources });
      return;
    }

    // Don't allow multiple simultaneous requests
    // Client should be showing UI when things are already afoot
    // There are lots of 'awaits' in the pipeline and if we don't do this
    // then we'll end up with race conditions
    if (this.pendingCompose) return;
    if (this.desiredSource != this.activeSource) return;

    if (overlays.length > 0) {
      void this.setupComposeSource(source, overlays);
    } else {
      this.desiredSource = { pin: sourceSwitchSourceToPin(source), primary: source, overlays: [] };
      void this.maybeSwitchSource();
    }
  }

  async maybeSwitchToFallback(source: InternalSource) {
    if (this.pendingSource.primary.id == "fallback") return;
    const allStreams = this.lastSmoothSwitchContext;
    const currentUnavailable = !this.sourceIsAvailable(source.primary) || allStreams.get(sourceSwitchSourceToPin(source.primary))?.length !== 2;
    const fallbackAvailable = this.sourceIsAvailable({ id: 'fallback' }) && allStreams.get(sourceSwitchSourceToPin({ id: 'fallback' }))?.length == 2;
    if (currentUnavailable && fallbackAvailable) {
      debuglog("Switching to fallback source", { id: this.id });
      this.desiredSource = { pin: 'fallback', primary: { id: 'fallback' }, overlays: [] };
      this.pendingSource = this.desiredSource;
      this.smooth?.switchSource("fallback")
    }
  }

  async maybeSwitchSource() {
    const oldSources = this.availableSources;
    const allStreams = this.lastSmoothSwitchContext;

    this.availableSources = [...allStreams.keys()].map(pinToSourceSwitchSource);

    // Switch to desired source if available and not already done so
    if (this.pendingSource !== this.desiredSource) {
      const currentAvailable = this.sourceIsAvailable(this.desiredSource.primary) && allStreams.get(this.desiredSource.pin)?.length == 2;
      if (currentAvailable) {
        this.pendingSource = this.desiredSource;
        this.smooth?.switchSource(this.desiredSource.pin);
      }
    }
    // Switch to fallback if either active/pending stops being available
    else if (this.pendingSource != this.activeSource) {
      await this.maybeSwitchToFallback(this.pendingSource);
    } else {
      await this.maybeSwitchToFallback(this.activeSource);
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
    if (this.pendingCompose) {
      await this.pendingCompose.compose.close();
      await this.pendingCompose.output.close();
      this.pendingCompose = undefined;
    }
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
          ...overlays.map((o, i): ComposePart<string> => ({
            pin: `overlay-${i}`,
            opacity: 1.0,
            zIndex: i + 1,
            compose: (metadata, settings) => ({
              sourceRect: o.sourceRect ?? { x: 0, y: 0, width: metadata.width, height: metadata.height },
              destRect: o.destRect ?? { x: 0, y: 0, width: settings.outputResolution.width, height: settings.outputResolution.height }
            })
          }))
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

    // Set up the overlays in order
    // We need pending and active here too...
    await this.ensureEnoughOverlaysExist(overlays);

    // And hook them up
    overlays.forEach((o, i) => {
      const source = this.subscriptions.find((s) => s.source.id == o.source.id);
      if (!source) {
        this.overlayInputs[i].subscribe([]);
        return;
      }
      this.overlayInputs[i].subscribe(
        o.source.key ?
          [source.selectVideoForKey(o.source.key)[0]] :
          [source.selectVideo()[0]]
      );
    });

    // And the rest
    this.pendingCompose.compose.subscribeToPins([
      source.key ?
        background.selectVideoToPinForKey("background", source.key)[0] :
        background.selectVideoToPin("background")[0]
      , ...overlays.map((_o, i) => {
        return {
          source: this.overlayInputs[i],
          sourceSelector: videoToPin(`overlay-${i}`)
        }
      })]);

    // This could be a mixer..
    this.pendingCompose.audio.subscribe([
      source.key ?
        background.selectAudioForKey(source.key)[0] :
        background.selectAudio()[0]
    ])
    this.desiredSource = {
      pin: `${this.pendingCompose.id}`, overlays, primary: source
    };
    this.doSubscriptions();
  }

  async ensureEnoughOverlaysExist(overlays: SourceSwitchOverlay[]) {
    while (this.overlayInputs.length < overlays.length) {
      const i = await this.norsk.processor.transform.streamKeyOverride({
        id: `${this.id}-compose-input-${this.overlayInputs.length}`,
        streamKey: {
          programNumber: 1,
          streamId: 256,
          sourceName: "compose-input",
          renditionName: `input-${this.overlayInputs.length}`
        }
      })
      this.overlayInputs.push(i)
    }
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
