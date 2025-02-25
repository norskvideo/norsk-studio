import { AdMarker, AutoProcessorMediaNode, CmafAudioOutputNode, CmafDestinationSettings, CmafMultiVariantOutputNode, CmafVideoOutputNode, HlsTsAudioOutputNode, HlsTsMultiVariantOutputNode, HlsTsVideoOutputNode, Norsk, Scte35InsertCommand, SourceMediaNode, StreamKey, StreamMetadata, selectExactKey, selectPlaylist, streamKeysAreEqual } from '@norskvideo/norsk-sdk';

import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { CreatedMediaNode, InstanceRouteInfo, OnCreated, ServerComponentDefinition, ServerComponentSchemas, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { debuglog, infolog } from '@norskvideo/norsk-studio/lib/server/logging';
import { CryptoDetails } from '../shared/drm/cpix';
import { ezdrmInit } from '../shared/drm/ezdrm';
import { axinomInit } from '../shared/drm/axinom';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';

import { OpenAPIV3 } from 'openapi-types';
import fs from 'fs/promises';
import { resolveRefs } from 'json-refs';
import path from 'path';
import YAML from 'yaml';
import { paths, components } from './types';
import { schemaFromTypes } from '../shared/schemas';

export type AutoCmafAkamaiDestinaton = components['schemas']['AutoCmafAkamaiDestination'];
export type AutoCmafS3Destination = components['schemas']['AutoCmafS3Destination'];
export type AutoCmafDestination = AutoCmafAkamaiDestinaton | AutoCmafS3Destination;

export type InitialState = components['schemas']['InitialState'];
export type AutoCmafConfig = components['schemas']['AutoCmafConfig'];
export type AutoCmafConfigExtended = components['schemas']['AutoCmafConfigExtended'];
export type AutoCmafSegment = components['schemas']['AutoCmafSegment'];
export type CmafOutputState = components['schemas']['CmafOutputState'];

export type CmafOutputEvent = {
  type: 'url-published' | 'output-enabled' | 'output-disabled',
  url?: string,
  drmToken?: string,
};

export type CmafOutputCommand = {
  type: 'enable-output' | 'disable-output',
}

type Transmuted<T> = {
  [Key in keyof T]: OpenAPIV3.PathItemObject;
};
function coreInfo<T>(path: keyof T, op: OpenAPIV3.OperationObject) {
  return {
    url: path,
    summary: op.summary,
    description: op.description,
    requestBody: op.requestBody,
    responses: op.responses,
  }
}

function post<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['post']!),
    method: 'POST' as const,
  }
}


export default class AutoCmafDefinition implements ServerComponentDefinition<AutoCmafConfig, AutoCmaf, CmafOutputState, CmafOutputCommand, CmafOutputEvent> {
  async create(norsk: Norsk, cfg: AutoCmafConfig, cb: OnCreated<AutoCmaf>, runtime: StudioRuntime<CmafOutputState, CmafOutputCommand, CmafOutputEvent>) {
    return this.createImpl(norsk, { mode: 'cmaf', ...cfg }, cb, runtime);
  }

  async createImpl(norsk: Norsk, cfg: AutoCmafConfigExtended, cb: OnCreated<AutoCmaf>, runtime: StudioRuntime<CmafOutputState, CmafOutputCommand, CmafOutputEvent>) {
    const node = await AutoCmaf.create(norsk, cfg, runtime);
    cb(node);
  }

  async handleCommand(node: AutoCmaf, command: CmafOutputCommand) {
    switch (command.type) {
      case 'enable-output':
        await node.enableOutput();
        break;
      case 'disable-output':
        await node.disableOutput();
        break;
      default:
        assertUnreachable(command.type);
    }
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<AutoCmafConfig, AutoCmaf, CmafOutputState, CmafOutputCommand, CmafOutputEvent>[]> {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'));
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
    const paths = resolved.paths as Transmuted<paths>;

    // This probably needs moving to shared, and having a timeout adding to it
    function waitFor(condition: () => boolean, finish: () => void) {
      if (condition()) {
        return finish();
      }
      setTimeout(() => {
        waitFor(condition, finish);
      }, 10)
    }

    return [
      {
        ...post<paths>('/enable', paths),
        handler: ({ runtime }) => async (_req, res) => {
          try {
            const state = runtime.updates.latest();
            if (state.enabled) {
              return res.status(400).json({ error: 'Output is already enabled' });
            }
            runtime.updates.sendCommand({
              type: 'enable-output'
            });
            waitFor(() => runtime.updates.latest().enabled, () => {
              res.sendStatus(204);
            })
          } catch (error) {
            console.error('Error in enable handler:', error);
            res.status(500).json({ error: 'Failed to enable output' });
          }
        }
      },
      {
        ...post<paths>('/disable', paths),
        handler: ({ runtime }) => async (_req, res) => {
          try {
            const state = runtime.updates.latest();
            if (!state.enabled) {
              return res.status(400).json({ error: 'Output is already disabled' });
            }
            runtime.updates.sendCommand({
              type: 'disable-output'
            });
            waitFor(() => !runtime.updates.latest().enabled, () => {
              res.sendStatus(204);
            })
          } catch (error) {
            console.error('Error in disable handler:', error);
            res.status(500).json({ error: 'Failed to disable output' });
          }
        }
      }
    ];
  }

  async schemas(): Promise<ServerComponentSchemas> {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'AutoCmafConfig', state: 'CmafOutputState' }
    )
  }
}

export class AutoCmaf extends CustomSinkNode {
  norsk: Norsk;
  cfg: AutoCmafConfigExtended;
  currentSources: Map<CreatedMediaNode, StudioNodeSubscriptionSource> = new Map();
  currentMedia: { node: AutoProcessorMediaNode<string>, key: StreamKey, scheduleAd: (marker: AdMarker, destinationId: string) => void }[] = [];
  crypto?: CryptoDetails;

  control: ContextPromiseControl = new ContextPromiseControl(this.handleContext.bind(this));

  // If there is only one program/source then this is the only one worth looking at
  mv?: CmafMultiVariantOutputNode | HlsTsMultiVariantOutputNode;
  defaultProgramNumber: number = 0;
  defaultSourceName: string = '';

  // But we'll make further entries if we see further programs
  currentMultiVariants: { node?: CmafMultiVariantOutputNode | HlsTsMultiVariantOutputNode, programNumber: number, sourceName: string }[] = [];

  initialised: Promise<void>;

  sessionId?: string;
  destinations: CmafDestinationSettings[];

  advertDestinations: string[] = [];
  runtime: StudioRuntime<CmafOutputState, CmafOutputCommand, CmafOutputEvent>;
  enabled: boolean = true;

  static async create(norsk: Norsk, cfg: AutoCmafConfigExtended, runtime: StudioRuntime<CmafOutputState, CmafOutputCommand, CmafOutputEvent>) {
    const node = new AutoCmaf(cfg, norsk, runtime);
    await node.initialised;
    return node;
  }

  constructor(cfg: AutoCmafConfigExtended, norsk: Norsk, runtime: StudioRuntime<CmafOutputState, CmafOutputCommand, CmafOutputEvent>) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.runtime = runtime;
    this.enabled = cfg.initialState == 'enabled';

    if (!this.enabled) {
      runtime.updates.raiseEvent({ type: 'output-disabled' })
    }

    if (this.cfg.sessionId) {
      this.sessionId = (Math.random() + 1).toString(36).substring(7);
    }

    this.destinations = [];
    this.destinations.push({
      type: "local",
      retentionPeriodSeconds: cfg.segments.retentionPeriod,
      defaultSegmentCount: cfg.segments.defaultSegmentCount, // this might need to be per dest actually
      holdBackSeconds: (cfg.segments.holdBackSegments ?? 3) * cfg.segments.targetSegmentDuration,
      partHoldBackSeconds: (cfg.segments.holdBackParts ?? 3) * cfg.segments.targetPartDuration,
      sessionId: this.sessionId,
      id: `local-${this.id}`
    });

    cfg.destinations.filter((d) => d.type == 's3').forEach((d, i) => {
      let sanitisedPrefix = d.prefix;
      if (sanitisedPrefix == "") {
        sanitisedPrefix = "/"
      }
      else {
        if (!sanitisedPrefix.startsWith("/"))
          sanitisedPrefix = "/" + sanitisedPrefix;
        if (!sanitisedPrefix.endsWith("/"))
          sanitisedPrefix = sanitisedPrefix + "/";
      }

      const id = `s3-${i}-${this.id}`;
      this.destinations.push({
        id,
        type: 's3',
        awsRegion: process.env.AWS_REGION ?? 'eu-west-2',
        host: d.host,
        sessionId: this.sessionId,
        pathPrefix: sanitisedPrefix,
        //
        // port: 443,
        port: 80,
        retentionPeriodSeconds: cfg.segments.retentionPeriod,
        holdBackSeconds: (cfg.segments.holdBackSegments ?? 3) * cfg.segments.targetSegmentDuration,
        partHoldBackSeconds: (cfg.segments.holdBackParts ?? 3) * cfg.segments.targetPartDuration
      })

      if (d.includeAdInsertions) {
        this.advertDestinations.push(id)
      }
    })

    cfg.destinations.filter((d) => d.type == 'akamai').forEach((d, i) => {
      const id = `akamai-${i}-${this.id}`;
      const url = new URL(d.ingest);
      this.destinations.push({
        id,
        type: 'generic',
        host: url.host,
        port: url.port ? parseInt(url.port, 10) : 80,
        pathPrefix: url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`,
        retentionPeriodSeconds: cfg.segments.retentionPeriod,
      })
      if (d.includeAdInsertions) {
        this.advertDestinations.push(id)
      }
    })
    // For testing only
    // although I don't think there are side effects?
    this.advertDestinations.push('local');
    this.initialised = this.initialise();
  }

  async initialise(): Promise<void> {
    if (this.cfg.drmProvider) {
      if (this.cfg.drmProvider === 'ezdrm') {
        this.crypto = await ezdrmInit(this.cfg.__global?.ezdrmConfig);
      }
      if (this.cfg.drmProvider === 'axinom') {
        this.crypto = await axinomInit(this.cfg.__global?.axinomConfig);
      }
    }

    const mvCryptoSettings = this.crypto ? {
      m3uAdditions: [
        this.crypto.audio.multivariantSignaling,
        this.crypto.video.multivariantSignaling,
      ].join("\n"),
      mpdAdditions: "",
    } : {};

    if (this.cfg.mode == 'cmaf') {
      const cmaf = await this.norsk.output.cmafMultiVariant({
        id: `${this.cfg.id}-multivariant-cmaf`,
        playlistName: this.cfg.name,
        destinations: this.destinations,
        ...mvCryptoSettings,
      });
      this.setup({ sink: cmaf });
      this.mv = cmaf;
    } else {
      const ts = await this.norsk.output.hlsTsMultiVariant({
        id: `${this.cfg.id}-multivariant-ts`,
        playlistName: this.cfg.name,
        destinations: this.destinations,
        ...mvCryptoSettings,
      });
      this.setup({ sink: ts });
      this.mv = ts;
    }
    this.runtime.report.registerOutput(this.cfg.id, this.mv.url);
    this.runtime.updates.raiseEvent({ type: 'url-published', url: this.mv.url, drmToken: this.crypto?.token });
  }

  async enableOutput() {
    if (!this.enabled) {
      debuglog("Enabling output", { id: this.id });
      this.enabled = true;
      await this.control.schedule();
      this.runtime.updates.raiseEvent({ type: 'output-enabled' })
      debuglog("Output enabled", { id: this.id });
    }
  }

  async disableOutput() {
    if (this.enabled) {
      debuglog("Disabling output", { id: this.id });
      this.enabled = false;
      for (const media of this.currentMedia) {
        await media.node?.close();
      }
      this.runtime.updates.raiseEvent({ type: 'output-disabled' })
      this.currentMedia = [];
      debuglog("output disabled", { id: this.id });
    }
  }

  // Can now guarantee this is only going to be ran once at a time
  // but work will be queued up and merged so it gets called the least amount of times
  // a pile of work below where we create pending state so we don't overlap can be removed
  async handleContext() {
    if (!this.enabled) {
      debuglog("Skipping context handling - output disabled", { id: this.id });
      return;
    }

    // This is where I get to create my nodes based on all the active sources?
    // but also by using our selectors to do that..
    const streams: {
      // Need this for the subscription we'll set up
      key: StreamKey,

      // Need this to know what sort of CMAF to spin up
      metadata: StreamMetadata

      // Need this to know where the *real* subscription will go
      source: SourceMediaNode
    }[] = [];


    // Build up a list of actually active streams
    this.currentSources.forEach((subscription) => {
      for (const stream of subscription.latestStreams()) {
        streams.push({
          key: stream.metadata.streamKey,
          source: stream.mediaNode,
          metadata: stream.metadata
        });
      }
    });


    const subscribes: Promise<unknown>[] = [];
    const creations = streams.map(async (stream) => {
      // If we've already created this one, then don't bother
      const existing = this.currentMedia.find((e) => streamKeysAreEqual(e.key, stream.key));
      if (existing) return;

      debuglog("Handling new stream in AutoCMAF", { id: this.id, streamKey: stream.key });

      if (this.currentMultiVariants.length == 0) {
        debuglog("Setting default multi-variant in AutoCMAF", { id: this.id, streamKey: stream.key });
        this.defaultProgramNumber = stream.key.programNumber;
        this.defaultSourceName = stream.key.sourceName;
      }

      if (this.cfg.multiplePrograms) {
        // Do we need another multivariant?
        if (!this.currentMultiVariants.find((v) => v.programNumber == stream.key.programNumber && v.sourceName == stream.key.sourceName)) {
          // Create immediately so we don't double-create later
          // cos all these streams are potentially being created in parallel once we do any async action
          const newMv = {
            programNumber: stream.key.programNumber,
            sourceName: stream.key.sourceName,
            node: undefined as (undefined | CmafMultiVariantOutputNode | HlsTsMultiVariantOutputNode),
          }
          this.currentMultiVariants.push(newMv);
          debuglog("Creating program-specific multi-variant in AutoPlaylist", { id: this.id, streamKey: stream.key });
          if (this.cfg.mode == 'cmaf') {
            newMv.node = await this.norsk.output.cmafMultiVariant({
              id: `${this.cfg.id}-multivariant-${stream.key.sourceName}-${stream.key.programNumber}-cmaf`,
              //id: `${this.cfg.id}-multivariant-${stream.key.sourceName}-${stream.key.programNumber}`,
              playlistName: `${this.cfg.name}-${stream.key.sourceName}-${stream.key.programNumber}`,
              destinations: this.destinations
            });
            this.runtime.report.registerOutput(this.cfg.id, newMv.node.url);
          } else {
            newMv.node = await this.norsk.output.cmafMultiVariant({
              id: `${this.cfg.id}-multivariant-${stream.key.sourceName}-${stream.key.programNumber}-ts`,
              //id: `${this.cfg.id}-multivariant-${stream.key.sourceName}-${stream.key.programNumber}`,
              playlistName: `${this.cfg.name}-${stream.key.sourceName}-${stream.key.programNumber}`,
              destinations: this.destinations
            });
            this.runtime.report.registerOutput(this.cfg.id, newMv.node.url);
          }
        }
      }

      const streamKeyString = `${stream.key.sourceName}-${stream.key.programNumber}-${stream.key.streamId}-${stream.key.renditionName}`;

      debuglog("Setting up media nodes for key", { id: this.id, key: stream.key, type: stream.metadata.message.case })

      switch (stream.metadata.message.case) {
        case undefined:
          throw "Bad server message";
        case "video": {
          const videoCryptoSettings = this.crypto ? {
            encryption: this.crypto.video,
            m3uAdditions: this.crypto.video.mediaSignaling,
            mpdAdditions: this.crypto.video.dashSignalling,
          } : {};

          let node: HlsTsVideoOutputNode | CmafVideoOutputNode | undefined = undefined;

          if (this.cfg.mode == 'cmaf') {
            const local = node = await this.norsk.output.cmafVideo({
              segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
              partDurationSeconds: this.cfg.segments.targetPartDuration,
              destinations: this.destinations,
              id: `${this.id}-${streamKeyString}-video-cmaf`,
              ...videoCryptoSettings,
            });
            local.onPlaylistAddition = (_, p) => p;
            local.onPlaylistAddition = undefined;

            subscribes.push(new Promise((resolve, _reject) => {
              local.subscribe([{
                source: stream.source,
                sourceSelector: selectExactKey(stream.key)
              }], (_) => true, (_) => resolve({}));
            }));
          } else {
            const local = node = await this.norsk.output.hlsTsVideo({
              segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
              destinations: this.destinations,
              id: `${this.id}-${streamKeyString}-video-ts`,
              ...videoCryptoSettings,
            });
            subscribes.push(new Promise((resolve, _reject) => {
              local.subscribe([{
                source: stream.source,
                sourceSelector: selectExactKey(stream.key)
              }], (_) => true, (_) => resolve({}));
            }));
          }
          const newMedia = {
            key: stream.key,
            node,
            scheduleAd: (ad: AdMarker, destinationId: string) => {
              const now = new Date();
              node?.scheduleTag(ad, now, destinationId)
            }
          }
          this.currentMedia.push(newMedia);
          this.registerInput(node);
          break;
        }
        case "audio": {
          const audioCryptoSettings = this.crypto ? {
            encryption: this.crypto.audio,
            m3uAdditions: this.crypto.audio.mediaSignaling,
            mpdAdditions: this.crypto.audio.dashSignalling,
          } : {};
          let node: HlsTsAudioOutputNode | CmafAudioOutputNode | undefined = undefined;

          if (this.cfg.mode == 'cmaf') {
            const local = node = await this.norsk.output.cmafAudio({
              segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
              partDurationSeconds: this.cfg.segments.targetPartDuration,
              destinations: this.destinations,
              id: `${this.id}-${streamKeyString}-audio-cmaf`,
              ...audioCryptoSettings,
            });
            local.onPlaylistAddition = (_, p) => p;
            local.onPlaylistAddition = undefined;
            subscribes.push(new Promise((resolve, _reject) => {
              local.subscribe([{
                source: stream.source,
                sourceSelector: selectExactKey(stream.key)
              }], (_) => true, (_) => resolve({}));
            }));
          } else {
            const local = node = await this.norsk.output.hlsTsAudio({
              segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
              destinations: this.destinations,
              id: `${this.id}-${streamKeyString}-audio-ts`,
              ...audioCryptoSettings,
            });
            subscribes.push(new Promise((resolve, _reject) => {
              local.subscribe([{
                source: stream.source,
                sourceSelector: selectExactKey(stream.key)
              }], (_) => true, (_) => resolve({}));
            }));
          }
          const newMedia = {
            key: stream.key,
            node,
            scheduleAd: (ad: AdMarker, destinationId: string) => {
              const now = new Date();
              node?.scheduleTag(ad, now, destinationId)
            }
          }
          this.currentMedia.push(newMedia);
          this.registerInput(node);
          break;
        }
        case "subtitle": {
          if (this.cfg.mode == 'cmaf') {
            const subtitleCmaf = await this.norsk.output.cmafWebVtt({
              segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
              destinations: this.destinations,
              id: `${this.id}-${streamKeyString}-webvtt`,
            });
            subscribes.push(new Promise((resolve, _reject) => {
              subtitleCmaf.subscribe([{
                source: stream.source,
                sourceSelector: selectExactKey(stream.key)
              }], (_) => true, (_) => resolve({}))
            }));

            const newMedia = {
              key: stream.key,
              node: subtitleCmaf,
              scheduleAd: (ad: AdMarker, destinationId: string) => {
                const now = new Date();
                subtitleCmaf.scheduleTag(ad, now, destinationId)
              }
            }
            this.currentMedia.push(newMedia);
            this.registerInput(subtitleCmaf);
          }
          break;
        }
        case "ancillary": {
          const ancillary = await this.norsk.processor.transform.ancillary({
            onScte35: (_stream, message) => {
              const commandType = message.spliceCommand.type;
              if (commandType != 'insert') return;
              const command = message.spliceCommand.value as Scte35InsertCommand;
              message.spliceCommand.value
              const adId = Math.random().toString().slice(-5);
              const schedule = new Date();
              schedule.setSeconds(schedule.getSeconds() + 8);
              for (const m of this.currentMedia) {
                for (const d of this.advertDestinations) {
                  m.scheduleAd({
                    id: adId,
                    scte35: message,
                    startDate: schedule,
                    durationSeconds: Number((command.breakDuration?.duration ?? 0n) / BigInt(90000.0))
                  }, d)
                }
              }
            }
          })
          subscribes.push(new Promise((resolve, _reject) => {
            ancillary.subscribe([{
              source: stream.source,
              sourceSelector: selectExactKey(stream.key)
            }], (_) => true, (_) => resolve({}))
          }));
          this.registerInput(ancillary);
          break;
        }
        case "playlist":
          break;
        default:
          assertUnreachable(stream.metadata.message);
      }
    });

    const deletions = this.currentMedia.filter((x) => {
      const stillExists = streams.find((y) => streamKeysAreEqual(y.key, x.key));
      if (stillExists) return false;
      return true;
    })

    for (const deletion of deletions) {
      const node = deletion.node;
      this.currentMedia = this.currentMedia.filter((x) =>
        !streamKeysAreEqual(x.key, deletion.key))
      debuglog("Closing old media node for non-existant key", { id: this.id, key: deletion.key })
      await node?.close();
    }

    debuglog("Waiting for media playlists to be created", { id: this.id, count: creations.length })
    await Promise.all(creations);

    const defaultSources = this.currentMedia.flatMap((m) => {
      if (m.key.programNumber == this.defaultProgramNumber && m.key.sourceName == this.defaultSourceName) return [{ source: m.node, sourceSelector: selectPlaylist }];
      return [];
    });

    if (defaultSources.length == 0 && this.defaultSourceName != '') {
      infolog("Resetting default multivariant because there are no streams");
      this.defaultProgramNumber = 0;
      this.defaultSourceName = '';
    }

    this.mv?.subscribe(defaultSources.
      map((s) => ({ source: s.source, sourceSelector: s.sourceSelector })));

    for (const mv of this.currentMultiVariants) {
      const sources = this.currentMedia.flatMap((m) => {
        if (m.key.programNumber == mv.programNumber && m.key.sourceName == mv.sourceName && m.node) return [{ source: m.node, sourceSelector: selectPlaylist }];
        return [];
      })
      if (sources.length == 0) {
        infolog("Removing multi-variant because all streams have gone")
        await mv.node?.close();
        this.currentMultiVariants = this.currentMultiVariants.filter((m) => m != mv);
      }
      mv.node?.subscribe(sources);
    }

    // The most important thing really, don't release this current context change
    // until all subscribes have been enacted
    await Promise.all(subscribes);
  }

  override subscribe(subs: StudioNodeSubscriptionSource[]) {
    this.currentSources = new Map();
    subs.forEach((s) => {
      this.currentSources.set(s.source, s);
    })
    this.control.setSources(subs);
  }
}


