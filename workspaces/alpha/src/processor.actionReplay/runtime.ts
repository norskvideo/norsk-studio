import {
  AudioEncodeNode, AudioStreamMetadata, CmafAudioOutputNode, CmafDestinationSettings, CmafMultiVariantOutputNode, CmafVideoOutputNode, MediaStorePlayerNode, MediaStoreRecorderNode, Norsk, SourceMediaNode, StreamKey, StreamMetadataOverrideNode, StreamSwitchSmoothNode, SubscriptionError,
  VideoStreamMetadata, avToPin, selectAV, selectAudio, selectExactKey, selectPlaylist, selectVideo
} from '@norskvideo/norsk-sdk';

import { OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { debuglog, errorlog, infolog } from '@norskvideo/norsk-studio/lib/server/logging';
import { tmpdir } from 'os';
import { HardwareAccelerationType, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';

export type ActionReplayConfig = {
  id: string,
  displayName: string,
  __global: {
    hardware?: HardwareAccelerationType,
  },
  notes?: string,
}

export type ActionReplayState = {
  contentPlayerUrl?: string
  replaying: boolean
}

export type ActionReplayEvent = {
  type: 'content-player-created',
  url: string
} | {
  type: 'replay-started'
} | {
  type: 'replay-finished'
}

export type ActionReplayCommand = {
  type: 'do-replay',
  from: number,
  duration: number
}


export default class ActionReplayDefinition implements ServerComponentDefinition<ActionReplayConfig, ActionReplay, ActionReplayState, ActionReplayCommand, ActionReplayEvent> {
  async create(norsk: Norsk, cfg: ActionReplayConfig, cb: OnCreated<ActionReplay>, runtime: StudioRuntime<ActionReplayState, ActionReplayCommand, ActionReplayEvent>) {
    const node = new ActionReplay(norsk, cfg, runtime);
    await node.initialised;
    cb(node);
  }
  handleCommand(node: ActionReplay, command: ActionReplayCommand) {
    const cmdType = command.type;
    switch (cmdType) {
      case 'do-replay':
        void node.replay(command.from, command.duration);
        break;
      default:
        assertUnreachable(cmdType);
    }
  }
}

export class ActionReplay {
  id: string;
  norsk: Norsk;
  cfg: ActionReplayConfig;
  initialised: Promise<void>;
  updates: RuntimeUpdates<ActionReplayState, ActionReplayCommand, ActionReplayEvent>
  shared: StudioShared;

  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  // Need a streamSwitchSmooth (or hard) as our output
  // Can this be config?
  // Can we auto-detect?
  smooth?: StreamSwitchSmoothNode<'source' | 'replay'>;

  // And we really need cheap encodes for the preview
  audioEncode?: AudioEncodeNode;
  videoEncode?: SourceMediaNode;

  // Need some CMAF (one audio, one video, one MV)  
  // for our preview/select
  audioCmaf?: CmafAudioOutputNode;
  videoCmaf?: CmafVideoOutputNode;
  mvCmaf?: CmafMultiVariantOutputNode;

  // Need a framestore recorder into which we'll place the last X
  writer?: MediaStoreRecorderNode;

  // And a reader from which we'll read the current replay
  reader?: MediaStorePlayerNode;

  currentSource?: StudioNodeSubscriptionSource;

  // A node needs to exist after creation for subscriptions to work
  passthrough?: StreamMetadataOverrideNode;

  audioStreamKey?: StreamKey;
  videoStreamKey?: StreamKey;

  constructor(norsk: Norsk, cfg: ActionReplayConfig, runtime: StudioRuntime<ActionReplayState, ActionReplayCommand, ActionReplayEvent>) {
    this.id = cfg.id;
    this.norsk = norsk;
    this.cfg = cfg;
    this.updates = runtime.updates;
    this.shared = runtime.shared;
    this.initialised = this.initialise();
  }

  async initialise() {
    this.passthrough = await this.norsk.processor.transform.streamMetadataOverride({
      id: `${this.id}-output`,
    })
    this.relatedMediaNodes.addOutput(this.passthrough);
  }

  subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts | undefined): void {
    this.currentSource = sources[0];
    this.currentSource.registerForContextChange(this);
    void this.sourceContextChange(() => { });
  }

  async replay(from: number, duration: number) {
    if (this.reader) {
      debuglog("Multiple replay attempts started, ignoring", { from, duration })
      return;
    }
    if (!this.writer || !this.smooth || !this.currentSource || !this.currentSource.source.relatedMediaNodes.output) {
      errorlog("Attempt to do replay before node is set up???", { from, duration })
      return;
    }
    if (!this.audioStreamKey || !this.videoStreamKey) {
      errorlog("Attempt to do replay with no known stream keys", { from, duration })
      return;
    }
    this.updates.raiseEvent({
      type: 'replay-started'
    })

    const smooth = this.smooth;
    const currentSource = this.currentSource;

    const cut = this.writer?.cutListEntry({
      durationMs: duration * 1000,
      startDateTime: new Date((new Date()).getTime() - (from * 1000)),
      streamSelection: [
        [this.videoStreamKey, this.videoStreamKey],
        [this.audioStreamKey, this.audioStreamKey]
      ],
      trimPartialGops: false
    })

    this.reader = await this.norsk.mediaStore.player({
      id: `${this.id}-reader`,
      cuts: [cut],
      sourceName: `${this.id}-cut`,
      onCreate: (node) => {
        smooth.subscribeToPins(
          currentSource.selectAvToPin<"source" | "replay">("source").concat([
            { source: node, sourceSelector: avToPin("replay") }
          ])
        )
      },
      onClose: () => {
        this.reader = undefined;
        this.updates.raiseEvent({
          type: 'replay-finished'
        })
        smooth.subscribeToPins(currentSource.selectAvToPin("source"));
      }
    })


  }

  public async sourceContextChange(_responseCallback: (error?: SubscriptionError) => void): Promise<boolean> {
    if (!this.currentSource) {
      this.teardown();
      return false;
    }

    const latestStreams = this.currentSource?.latestStreams();

    if (latestStreams.length < 2) {
      this.teardown();
      return false;
    }

    const video = latestStreams.find((s) => s.metadata.message.case == 'video');
    const audio = latestStreams.find((s) => s.metadata.message.case == 'audio');

    if (!video || !audio) {
      this.teardown();
      return false;
    }

    // We should check if the source has changed at all really but
    // we're terrible at doing that elsewhere so..
    const videoMetadata = video.metadata.message.value as VideoStreamMetadata;
    const audioMetadata = audio.metadata.message.value as AudioStreamMetadata;

    this.audioStreamKey = audio.metadata.streamKey;
    this.videoStreamKey = video.metadata.streamKey;

    infolog("Action replay node has a valid context, spinning up some nodes", { videoMetadata, audioMetadata });

    this.smooth = await this.norsk.processor.control.streamSwitchSmooth<'source' | 'replay'>({
      id: `${this.id}-switch`,
      outputSource: `${this.id}-source`,
      outputResolution: { width: videoMetadata.width, height: videoMetadata.height },
      frameRate: videoMetadata.frameRate ?? { frames: 25, seconds: 1 },
      sampleRate: audioMetadata.sampleRate,
      channelLayout: audioMetadata.channelLayout ?? 'stereo',
      hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["quadra", "nvidia"]),
      activeSource: 'source',
      transitionDurationMs: 500.0,
      onInboundContextChange: async (ctx) => {
        if (ctx.get('replay')?.length == 2) {
          await this.smooth?.switchSource('replay');
        }
        else {
          await this.smooth?.switchSource('source');
        }
      }
    })
    this.relatedMediaNodes.addInput(this.smooth);

    const dir = tmpdir();
    this.writer = await this.norsk.mediaStore.recorder({
      id: `${this.id}-store`,
      name: `${this.id}-store`,
      path: dir, // TODO: ambient locations
      chunkFileDurationSeconds: 60,
      // TODO: Check this actually works? Maybe it means 500ms!
      // expiry: {
      //   expire: 'byTime',
      //   durationS: 500 // a bit more than our hls
      // }
    })

    this.videoEncode = await this.shared.previewEncode(
      this.currentSource.selectStreams(selectExactKey(this.videoStreamKey))[0]
      , this.cfg.__global.hardware)

    this.audioEncode = await this.norsk.processor.transform.audioEncode({
      id: `${this.id}-audio-encode`,
      channelLayout: 'stereo',
      bitrate: 64000,
      outputRenditionName: `${this.id}-preview`,
      codec: {
        kind: 'aac',
        sampleRate: audioMetadata.sampleRate,
        profile: 'lc'
      }
    })
    const localDestination: CmafDestinationSettings = {
      id: `${this.id}-local`,
      type: 'local',
      retentionPeriodSeconds: 360 // 5 minutes should be enough for anyone
    }
    this.audioCmaf = await this.norsk.output.cmafAudio({
      id: `${this.id}-cmaf-audio`,
      segmentDurationSeconds: 2,
      partDurationSeconds: 0.5,
      destinations: [localDestination]
    });
    this.videoCmaf = await this.norsk.output.cmafVideo({
      id: `${this.id}-cmaf-video`,
      segmentDurationSeconds: 2,
      partDurationSeconds: 0.5,
      destinations: [localDestination]
    });

    this.mvCmaf = await this.norsk.output.cmafMultiVariant({
      id: `${this.id}-cmaf-mv`,
      playlistName: `${this.id}-mv`,
      destinations: [localDestination]
    });

    this.smooth.subscribeToPins(
      this.currentSource.selectAvToPin("source")
      , (ctx) => {
        if (ctx.streams.length == 2) return 'accept';
        return 'deny';
      })

    this.audioEncode.subscribe(this.currentSource.selectAudio())
    this.audioCmaf.subscribe([
      { source: this.audioEncode, sourceSelector: selectAudio }
    ])
    this.videoCmaf.subscribe([
      { source: this.videoEncode, sourceSelector: selectVideo }
    ])
    this.mvCmaf.subscribe([
      { source: this.audioCmaf, sourceSelector: selectPlaylist },
      { source: this.videoCmaf, sourceSelector: selectPlaylist },
    ])

    this.updates.raiseEvent({
      type: 'content-player-created',
      url: this.mvCmaf.url
    })

    this.passthrough?.subscribe([
      { source: this.smooth, sourceSelector: selectAV }
    ])

    // And write everything
    this.writer.subscribe(this.currentSource.selectStreams());

    // We're not doing any subscriptions ourself
    return false;
  }

  teardown() {
    // Not sure if we do this or not
  }
}


