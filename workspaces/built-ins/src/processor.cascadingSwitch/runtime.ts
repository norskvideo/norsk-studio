import {
  ChannelLayout, MediaNodeId
  , Norsk, SampleRate, StreamMetadata
  , StreamSwitchSmoothNode, VideoTestcardGeneratorNode, audioToPin,
  videoToPin, ReceiveFromAddress, SourceMediaNode
} from '@norskvideo/norsk-sdk';

import { SilenceSource } from '../input.silence/runtime';
import { OnCreated, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode, SubscriptionOpts } from "@norskvideo/norsk-studio/lib/extension/base-nodes";

// Ideally this lives in client code too
// Basically silence + test card config..
// as well as smooth switcher
export type CascadingSwitchConfig = {
  id: MediaNodeId,
  displayName: string,
  resolution: { width: number, height: number },
  frameRate: { frames: number, seconds: number },
  sampleRate: SampleRate,
  channelLayout: ChannelLayout
  sources: string[],
}

export type CascadingSwitchState = {
  activeSource: string,
  availableSources: string[]
}

export type CascadingSwitchEvent = {
  type: 'active-source-changed',
  activeSource: string
} | {
  type: 'source-online'
  source: string
} | {
  type: 'source-offline'
  source: string
};

export type CascadingSwitchCommand = object; // for now

export default class CascadingSwitchDefinition implements ServerComponentDefinition<CascadingSwitchConfig,
  CascadingSwitch,
  CascadingSwitchState,
  CascadingSwitchCommand,
  CascadingSwitchEvent> {
  async create(norsk: Norsk,
    cfg: CascadingSwitchConfig,
    cb: OnCreated<CascadingSwitch>,
    { updates }: StudioRuntime<CascadingSwitchState, CascadingSwitchCommand, CascadingSwitchEvent>) {

    const onActiveSourceChanged = (activeSource: string) => {
      updates.raiseEvent({ type: 'active-source-changed', activeSource });
    }

    const onSourceOnline = (source: string) => {
      updates.raiseEvent({ type: 'source-online', source });
    }

    const onSourceOffline = (source: string) => {
      updates.raiseEvent({ type: 'source-offline', source });
    }

    const cfgWithHooks = { onActiveSourceChanged, onSourceOnline, onSourceOffline, ...cfg };
    const node = new CascadingSwitch(norsk, cfgWithHooks);
    await node.initialised;
    cb(node);
  }
}

// 
// Everything below this line is Norsk only
//

type CascadingSwitchConfigComplete = {
  onActiveSourceChanged: (source: string) => void,
  onSourceOnline: (source: string) => void,
  onSourceOffline: (source: string) => void,
} & CascadingSwitchConfig

export class CascadingSwitch extends CustomAutoDuplexNode {
  norsk: Norsk;
  cfg: CascadingSwitchConfigComplete;
  audio?: SilenceSource;
  video?: VideoTestcardGeneratorNode;
  smooth?: StreamSwitchSmoothNode<string>;
  initialised: Promise<void>;
  activeSource: string = '';
  availableSources: string[] = [];

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
      sampleRate: this.cfg.sampleRate,
      channelLayout: this.cfg.channelLayout,
      onInboundContextChange: this.onSwitchContext.bind(this),
      onTransitionComplete: this.onTransitionComplete.bind(this)
    });
    this.audio = audio;
    this.video = video;
    this.smooth = smooth;
    this.setup({ input: smooth, output: [smooth] });
    this.subscribe([]);
  }

  constructor(norsk: Norsk, cfg: CascadingSwitchConfigComplete) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
    this.initialised = this.initialise();
  }

  onTransitionComplete() {
    this.cfg.onActiveSourceChanged?.(this.activeSource);
  }

  async onSwitchContext(allStreams: Map<string, StreamMetadata[]>) {
    const oldSources = this.availableSources;
    this.availableSources = this.cfg.sources.filter((s) => {
      const matching = allStreams.get(s);
      return matching?.length == 2;
    })
    const active = this.availableSources.at(0);

    if (active && this.activeSource != active) {
      this.activeSource = active;
      this.smooth?.switchSource(active)
    } else if (!active && this.activeSource != 'fallback') {
      this.activeSource = 'fallback';
      this.smooth?.switchSource("fallback")
    }

    for (const existing of oldSources) {
      if (!this.availableSources.includes(existing))
        this.cfg?.onSourceOffline(existing);
    }

    for (const current of this.availableSources) {
      if (!oldSources.includes(current))
        this.cfg?.onSourceOnline(current);
    }
  }

  subscribe(subs: StudioNodeSubscriptionSource[], opts?: SubscriptionOpts) {
    const subscriptions = subs.flatMap((s) => {
      return s.selectAvToPin(s.source.id)
    }).filter((x): x is ReceiveFromAddress<string> => !!x) ?? [];

    if (this.audio)
      subscriptions.push(
        { source: (this.audio.relatedMediaNodes.output[0]) as SourceMediaNode, sourceSelector: audioToPin("fallback") }
      );
    if (this.video)
      subscriptions.push(
        {
          source: this.video, sourceSelector: videoToPin("fallback")
        }
      );
    this.smooth?.subscribeToPins(subscriptions, opts?.requireOneOfEverything ? (ctx) => ctx.streams.length == (subs.length * 2) + 2 : undefined);
  }


  override async close() {
    await super.close();
    await this.audio?.close();
    await this.video?.close();
  }
}
