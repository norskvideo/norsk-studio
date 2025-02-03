import { AdMarker, AutoProcessorMediaNode, CmafDestinationSettings, CmafMultiVariantOutputNode, Norsk, Scte35InsertCommand, SourceMediaNode, StreamKey, StreamMetadata, selectExactKey, selectPlaylist, streamKeysAreEqual } from '@norskvideo/norsk-sdk';

import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { CreatedMediaNode, InstanceRouteInfo, OnCreated, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { ReportBuilder } from '@norskvideo/norsk-studio/lib/runtime/execution';
import { debuglog, infolog } from '@norskvideo/norsk-studio/lib/server/logging';
import { AxinomConfig, EzDrmConfig } from '@norskvideo/norsk-studio/lib/shared/config';
import { CryptoDetails } from '../shared/drm/cpix';
import { ezdrmInit } from '../shared/drm/ezdrm';
import { axinomInit } from '../shared/drm/axinom';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';

import { OpenAPIV3 } from 'openapi-types';
import fs from 'fs/promises';
import { resolveRefs } from 'json-refs';
import path from 'path';
import YAML from 'yaml';
import { paths } from './types';


export type AutoCmafS3Destination = {
  host: string,
  prefix: string,
  includeAdInsertions: boolean
}

export type AutoCmafConfig = {
  id: string,
  displayName: string,
  name: string,
  notes?: string,
  sessionId: boolean,
  segments: AutoCmafSegment,
  s3Destinations: AutoCmafS3Destination[],
  drmProvider?: 'ezdrm' | 'axinom',
  __global: {
    ezdrmConfig?: EzDrmConfig,
    axinomConfig?: AxinomConfig,
  },
}

export type AutoCmafSegment = {
  retentionPeriod: number,
  defaultSegmentCount?: number,
  targetSegmentDuration: number,
  targetPartDuration: number,
  holdBackSegments?: number,
  holdBackParts?: number
}

export type CmafOutputState = {
  url?: string,
  drmToken?: string,
  enabled: boolean,
};

export type CmafOutputEvent = {
  type: 'url-published' | 'output-enabled' | 'output-disabled',
  url: string,
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
  async create(norsk: Norsk, cfg: AutoCmafConfig, cb: OnCreated<AutoCmaf>, { updates, report }: StudioRuntime<CmafOutputState, CmafOutputCommand, CmafOutputEvent>) {
    const node = await AutoCmaf.create(norsk, cfg, report);
    cb(node);
    const mv = node.mv;
    if (mv) {
      report.registerOutput(cfg.id, mv.url);
      updates.raiseEvent({ type: 'url-published', url: mv.url, drmToken: node.crypto?.token });
    }
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

    return [
      {
        ...post<paths>('/enable', paths),
        handler: ({ runtime }) => async (_req, res) => {
          try {
            const state = runtime.updates.latest();
            if (state.enabled) {
              return res.status(400).json({ error: 'Output is already enabled' });
            }

            runtime.updates.update({ ...state, enabled: true });

            runtime.updates.sendCommand({
              type: 'enable-output'
            });

            runtime.updates.raiseEvent({
              type: 'output-enabled',
              url: state.url ?? '',
            });

            res.sendStatus(204);
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

            runtime.updates.update({ ...state, enabled: false });

            runtime.updates.sendCommand({
              type: 'disable-output'
            });

            runtime.updates.raiseEvent({
              type: 'output-disabled',
              url: state.url ?? '',
            });

            res.sendStatus(204);
          } catch (error) {
            console.error('Error in disable handler:', error);
            res.status(500).json({ error: 'Failed to disable output' });
          }
        }
      }
    ];
  }
}

export class AutoCmaf extends CustomSinkNode {
  norsk: Norsk;
  cfg: AutoCmafConfig;
  currentSources: Map<CreatedMediaNode, StudioNodeSubscriptionSource> = new Map();
  currentMedia: { node: AutoProcessorMediaNode<string>, key: StreamKey, scheduleAd: (marker: AdMarker, destinationId: string) => void }[] = [];
  crypto?: CryptoDetails;


  control: ContextPromiseControl = new ContextPromiseControl(this.handleContext.bind(this));

  // If there is only one program/source then this is the only one worth looking at
  mv?: CmafMultiVariantOutputNode;
  defaultProgramNumber: number = 0;
  defaultSourceName: string = '';

  // But we'll make further entries if we see further programs
  currentMultiVariants: { node?: CmafMultiVariantOutputNode, programNumber: number, sourceName: string }[] = [];

  initialised: Promise<void>;

  sessionId?: string;
  destinations: CmafDestinationSettings[];

  advertDestinations: string[] = [];
  report: ReportBuilder;
  enabled: boolean = true;
  nodeCounter: number = 0;

  static async create(norsk: Norsk, cfg: AutoCmafConfig, report: ReportBuilder) {
    const node = new AutoCmaf(cfg, norsk, report);
    await node.initialised;
    return node;
  }

  constructor(cfg: AutoCmafConfig, norsk: Norsk, report: ReportBuilder) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.report = report;

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
      id: 'local'
    });

    cfg.s3Destinations.forEach((d, i) => {
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

      const id = `s3-${i}`;
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
    const mv = await this.norsk.output.cmafMultiVariant({
      id: this.incrementNodeId(`${this.cfg.id}-multivariant`),
      //id: `${this.cfg.id}-multivariant`,
      playlistName: this.cfg.name,
      destinations: this.destinations,
      ...mvCryptoSettings,
    });
    this.setup({ sink: mv });
    this.mv = mv;
  }

  incrementNodeId(id: string): string {
    this.nodeCounter++;
    return `${id}-${this.nodeCounter}`;
  }

  async enableOutput() {
    if (!this.enabled) {
      this.enabled = true;
      await this.handleContext();
      debuglog("Output enabled", { id: this.id });
    }
  }

  async disableOutput() {
    if (this.enabled) {
      this.enabled = false;
      for (const media of this.currentMedia) {
        await media.node.close();
      }
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

      // Do we need another multivariant?
      if (!this.currentMultiVariants.find((v) => v.programNumber == stream.key.programNumber && v.sourceName == stream.key.sourceName)) {
        // Create immediately so we don't double-create later
        // cos all these streams are potentially being created in parallel once we do any async action
        const newMv = {
          programNumber: stream.key.programNumber,
          sourceName: stream.key.sourceName,
          node: undefined as (undefined | CmafMultiVariantOutputNode)
        }
        this.currentMultiVariants.push(newMv);
        const mv = await this.norsk.output.cmafMultiVariant({
          id: this.incrementNodeId(`${this.cfg.id}-multivariant-${stream.key.sourceName}-${stream.key.programNumber}`),
          //id: `${this.cfg.id}-multivariant-${stream.key.sourceName}-${stream.key.programNumber}`,
          playlistName: `${this.cfg.name}-${stream.key.sourceName}-${stream.key.programNumber}`,
          destinations: this.destinations
        });
        debuglog("Creating program-specific multi-variant in AutoCMAF", { id: this.id, streamKey: stream.key });
        newMv.node = mv;
        this.report.registerOutput(this.cfg.id, mv.url);
      }

      const streamKeyString = `${stream.key.sourceName}-${stream.key.programNumber}-${stream.key.streamId}-${stream.key.renditionName}`;

      switch (stream.metadata.message.case) {
        case undefined:
          throw "Bad server message";
        case "video": {
          const videoCryptoSettings = this.crypto ? {
            encryption: this.crypto.video,
            m3uAdditions: this.crypto.video.mediaSignaling,
            mpdAdditions: this.crypto.video.dashSignalling,
          } : {};
          const video = await this.norsk.output.cmafVideo({
            segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
            partDurationSeconds: this.cfg.segments.targetPartDuration,
            destinations: this.destinations,
            id: this.incrementNodeId(`${this.id}-${streamKeyString}-video`),
            //id: `${this.id}-${streamKeyString}-video`,
            ...videoCryptoSettings,
          });
          video.onPlaylistAddition = (_, p) => p;
          video.onPlaylistAddition = undefined;

          subscribes.push(new Promise((resolve, _reject) => {
            video.subscribe([{
              source: stream.source,
              sourceSelector: selectExactKey(stream.key)
            }], (_) => true, (_) => resolve({}));
          }));
          const newMedia = {
            key: stream.key,
            node: video,
            scheduleAd: (ad: AdMarker, destinationId: string) => {
              const now = new Date();
              video.scheduleTag(ad, now, destinationId)
            }
          }
          this.currentMedia.push(newMedia);
          this.registerInput(video);
          break;
        }
        case "audio": {
          const audioCryptoSettings = this.crypto ? {
            encryption: this.crypto.audio,
            m3uAdditions: this.crypto.audio.mediaSignaling,
            mpdAdditions: this.crypto.audio.dashSignalling,
          } : {};
          const audio = await this.norsk.output.cmafAudio({
            segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
            partDurationSeconds: this.cfg.segments.targetPartDuration,
            destinations: this.destinations,
            id: this.incrementNodeId(`${this.id}-${streamKeyString}-video`),
            //id: `${this.id}-${streamKeyString}-audio`,
            ...audioCryptoSettings,
          });
          audio.onPlaylistAddition = (_, p) => p;
          audio.onPlaylistAddition = undefined;
          subscribes.push(new Promise((resolve, _reject) => {
            audio.subscribe([{
              source: stream.source,
              sourceSelector: selectExactKey(stream.key)
            }], (_) => true, (_) => resolve({}));
          }));

          const newMedia = {
            key: stream.key,
            node: audio,
            scheduleAd: (ad: AdMarker, destinationId: string) => {
              const now = new Date();
              audio.scheduleTag(ad, now, destinationId)
            }
          }
          this.currentMedia.push(newMedia);
          this.registerInput(audio);
          break;
        }
        case "subtitle": {
          const subtitle = await this.norsk.output.cmafWebVtt({
            segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
            destinations: this.destinations,
            id: this.incrementNodeId(`${this.id}-${streamKeyString}-webvtt`),
          });
          subtitle.subscribe([{
            source: stream.source,
            sourceSelector: selectExactKey(stream.key)
          }]);
          const newMedia = {
            key: stream.key,
            node: subtitle,
            scheduleAd: (ad: AdMarker, destinationId: string) => {
              const now = new Date();
              subtitle.scheduleTag(ad, now, destinationId)
            }
          }
          this.currentMedia.push(newMedia);
          this.registerInput(subtitle);
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
          ancillary.subscribe([{
            source: stream.source,
            sourceSelector: selectExactKey(stream.key)
          }]);
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
      await node.close();
    }

    await Promise.all(creations);

    const defaultSources = this.currentMedia.flatMap((m) => {
      if (m.key.programNumber == this.defaultProgramNumber && m.key.sourceName == this.defaultSourceName && m.node) return [{ source: m.node, sourceSelector: selectPlaylist }];
      return [];
    });

    if (defaultSources.length == 0 && this.defaultSourceName != '') {
      infolog("Resetting default multivariant because there are no streams");
      this.defaultProgramNumber = 0;
      this.defaultSourceName = '';
    }
    this.mv?.subscribe(defaultSources);

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


