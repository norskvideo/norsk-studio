import { AdMarker, AutoProcessorMediaNode, CmafDestinationSettings, CmafMultiVariantOutputNode, Norsk, Scte35InsertCommand, SourceMediaNode, StreamKey, StreamMetadata, SubscriptionError, selectExactKey, selectPlaylist, streamKeysAreEqual } from '@norskvideo/norsk-sdk';

import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { CreatedMediaNode, OnCreated, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { ReportBuilder } from '@norskvideo/norsk-studio/lib/runtime/execution';


export type AutoCmafS3Destination = {
  host: string,
  prefix: string,
  includeAdInsertions: boolean
}

export type AutoCmafConfig = {
  id: string,
  displayName: string,
  name: string,
  sessionId: boolean,
  segments: AutoCmafSegment,
  s3Destinations: AutoCmafS3Destination[],
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
  url?: string
}


export type CmafOutputEvent = {
  type: 'url-published',
  url: string
}

export type CmafOutputCommand = object;

export default class AutoCmafDefinition implements ServerComponentDefinition<AutoCmafConfig, AutoCmaf, CmafOutputState, CmafOutputCommand, CmafOutputEvent> {
  async create(norsk: Norsk, cfg: AutoCmafConfig, cb: OnCreated<AutoCmaf>, { updates, report }: StudioRuntime<CmafOutputState, CmafOutputEvent>) {
    const node = await AutoCmaf.create(norsk, cfg, report);
    cb(node);
    const mv = node.mv;
    if (mv) {
      report.registerOutput(cfg.id, mv.url);
      updates.raiseEvent({ type: 'url-published', url: mv.url })
    }
  }
}


export class AutoCmaf extends CustomSinkNode {
  norsk: Norsk;
  cfg: AutoCmafConfig;
  currentSources: Map<CreatedMediaNode, StudioNodeSubscriptionSource> = new Map();
  currentMedia: { node?: AutoProcessorMediaNode<string>, key: StreamKey, scheduleAd: (marker: AdMarker, destinationId: string) => void }[] = [];

  // If there is only one program/source then this is the only one worth looking at
  mv?: CmafMultiVariantOutputNode;
  defaultProgramNumber: number = 0;
  defaultSourceName: string = '';

  // But we'll make further entries if we see further programs
  currentMultiVariants: { node?: CmafMultiVariantOutputNode, programNumber: number, sourceName: string }[] = [];

  pendingResponses: ((error?: SubscriptionError) => void)[] = [];
  initialised: Promise<void>;

  sessionId?: string;
  destinations: CmafDestinationSettings[];

  advertDestinations: string[] = [];
  report: ReportBuilder;

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
    // this.advertDestinations.push('local');
    this.initialised = this.initialise();
  }

  async initialise() {
    const mv = await this.norsk.output.cmafMultiVariant({
      id: `${this.cfg.id}-multivariant`,
      playlistName: this.cfg.name,
      destinations: this.destinations
    });
    this.setup({ sink: mv });
    this.mv = mv;
  }


  async sourceContextChange(responseCallback: (error?: SubscriptionError) => void) {
    this.pendingResponses.push(responseCallback);
    if (this.pendingResponses.length == 1) {
      // This is the only thing in the queue - feel free to start it
      setTimeout(() => void this.popContextStack(), 0);
    }
    // And we always wait for all of this to happen
    return true;
  }

  async popContextStack() {
    // This is where I get to create my nodes based on all the active sources?
    // but also by using our selectors to do that..
    const streams: {
      // Need this for the subscription we'll set up
      key: StreamKey,

      // Need this to know what sort of CMAF to spin up
      metadata: StreamMetadata

      // Need this to know where the *real* subscription wlll go
      source: SourceMediaNode
    }[] = [];


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
      const existing = this.currentMedia.find((e) => streamKeysAreEqual(e.key, stream.key));
      if (existing) return;

      // Create immediately so we can defer this promise and do any other context changes without
      // double-creating things
      const newMedia = {
        key: stream.key,
        node: undefined as (undefined | AutoProcessorMediaNode<string>),
        scheduleAd: (_ad: AdMarker, _destinationId: string) => { }
      }
      this.currentMedia.push(newMedia);

      if (this.currentMultiVariants.length == 0) {
        this.defaultProgramNumber = stream.key.programNumber;
        this.defaultSourceName = stream.key.sourceName;
      }

      // Do we need another multivariant?
      if (!this.currentMultiVariants.find((v) => v.programNumber == stream.key.programNumber && v.sourceName == stream.key.sourceName)) {
        // Create immediately so we don't double-create later
        const newMv = {
          programNumber: stream.key.programNumber,
          sourceName: stream.key.sourceName,
          node: undefined as (undefined | CmafMultiVariantOutputNode)
        }
        this.currentMultiVariants.push(newMv);
        const mv = await this.norsk.output.cmafMultiVariant({
          id: `${this.cfg.id}-multivariant-${stream.key.sourceName}-${stream.key.programNumber}`,
          playlistName: `${this.cfg.name}-${stream.key.sourceName}-${stream.key.programNumber}`,
          destinations: this.destinations
        });
        newMv.node = mv;
        this.report.registerOutput(this.cfg.id, mv.url);
      }

      const streamKeyString = `${stream.key.sourceName}-${stream.key.programNumber}-${stream.key.streamId}-${stream.key.renditionName}`;

      // Okay, so we need to do the thing
      switch (stream.metadata.message.case) {
        case undefined:
          throw "Bad server message";
        case "video": {
          const video = await this.norsk.output.cmafVideo({
            segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
            partDurationSeconds: this.cfg.segments.targetPartDuration,
            destinations: this.destinations,
            id: `${this.id}-${streamKeyString}-video`
          });
          newMedia.node = video;
          newMedia.scheduleAd = (ad, destinationId: string) => {
            const now = new Date();
            video.scheduleTag(ad, now, destinationId)
          };
          subscribes.push(new Promise((resolve, _reject) => {
            video.subscribe([{
              source: stream.source,
              sourceSelector: selectExactKey(stream.key)
            }], (_) => true, (_) => resolve({}));
          }));

          this.registerInput(video);
          break;
        }
        case "audio": {
          const audio = await this.norsk.output.cmafAudio({
            segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
            partDurationSeconds: this.cfg.segments.targetPartDuration,
            destinations: this.destinations,
            id: `${this.id}-${streamKeyString}-audio`
          });
          newMedia.node = audio;
          newMedia.scheduleAd = (ad, destinationId: string) => {
            const now = new Date();
            audio.scheduleTag(ad, now, destinationId)
          };

          subscribes.push(new Promise((resolve, _reject) => {
            audio.subscribe([{
              source: stream.source,
              sourceSelector: selectExactKey(stream.key)
            }], (_) => true, (_) => resolve({}));
          }));

          this.registerInput(audio);
          break;
        }
        case "subtitle": {
          const subtitle = await this.norsk.output.cmafWebVtt({
            segmentDurationSeconds: this.cfg.segments.targetSegmentDuration,
            destinations: this.destinations,
            id: `${this.id}-${streamKeyString}-webvtt`
          });
          newMedia.node = subtitle;
          newMedia.scheduleAd = (ad, destinationId: string) => {
            const now = new Date();
            subtitle.scheduleTag(ad, now, destinationId)
          };
          subtitle.subscribe([{
            source: stream.source,
            sourceSelector: selectExactKey(stream.key)
          }]);
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
                    durationSeconds: Number(command.breakDuration.duration / BigInt(90000.0))
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

    const thisResponse = this.pendingResponses.shift();

    if (this.pendingResponses.length > 0) {
      await this.popContextStack();
    }

    await Promise.all(creations);

    this.mv?.subscribe(
      this.currentMedia.flatMap((m) => {
        if (m.key.programNumber == this.defaultProgramNumber && m.key.sourceName == this.defaultSourceName && m.node) return [{ source: m.node, sourceSelector: selectPlaylist }];
        return [];
      }));

    for (const mv of this.currentMultiVariants) {
      mv.node?.subscribe(
        this.currentMedia.flatMap((m) => {
          if (m.key.programNumber == mv.programNumber && m.key.sourceName == mv.sourceName && m.node) return [{ source: m.node, sourceSelector: selectPlaylist }];
          return [];
        }));
    }

    await Promise.all(subscribes);

    if (thisResponse)
      thisResponse();
  }

  override subscribe(subs: StudioNodeSubscriptionSource[]) {
    const newSources = new Map();
    subs.forEach((sub) => {
      newSources.set(sub.source, sub);
    }, new Map<CreatedMediaNode, StudioNodeSubscriptionSource[]>());
    this.currentSources.forEach((subscription, source) => {
      if (!newSources.has(source)) {
        subscription.unregisterForContextChange(this);
      }
    });
    newSources.forEach((subscription, source) => {
      if (!this.currentSources.has(source)) {
        subscription.registerForContextChange(this);
      }
    });
    this.currentSources = newSources;
    // Now we manually invoke this puppy, because we want to do subscriptions based on current contexts if available
    void this.sourceContextChange((() => { }));
  }
}


