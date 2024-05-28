import { AudioGainNode, AudioMeasureLevels, AudioMeasureLevelsNode, AudioMixNode, AudioMixSettings, ChannelLayout, Db, MediaNodeId, Norsk, StreamKey, SubscriptionError, getAmountOfChannels, selectAudio } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from 'norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode } from 'norsk-studio/lib/extension/base-nodes';
import { assertUnreachable } from 'norsk-studio/lib/shared/util';

export type AudioMixerSettings = {
  id: string;
  displayName: string;
  defaultGain: number;
  channelLayout: ChannelLayout;
};

export type AudioMixerLevels = {
  levels?: { peak: number, rms: number },
  sliderGain: number,
  preMuteSliderGain?: number,
  nodeGain?: Db,
  key?: string,
  isMuted: boolean,
}

export type AudioMixerState = {
  knownSources: AudioMixerSource[],
  sources: {
    [sourceIdAndKey: string]: AudioMixerLevels
  },
  gainRange: GainRange,
  displayInlineChannels: boolean,
}

export function mkSourceKey(sourceId: string, key?: string) {
  return key ? sourceId + "-" + key : sourceId
}

export type AudioMixerEvent = {
  type: 'audio-levels',
  sourceId: string,
  key?: string,
  levels: {
    peak: number,
    rms: number
  }
} | {
  type: "set-gain",
  sourceId: string,
  key?: string,
  sliderGain: number,
  nodeGain: Db,
} | {
  type: "sources-discovered",
  sources: AudioMixerSource[]
} | {
  type: "switch-mute",
  sourceId: string,
  muted: boolean,
  preMuteSliderValue: number,
  key?: string,
} | {
  type: "source-dropped",
  sourceId: string,
  key?: string
} | {
  type: "display-inline-channels",
  display: boolean
}

export type AudioMixerCommand = {
  type: "set-gain-cmd",
  sourceId: string,
  key?: string,
  value: number,
} | {
  type: "switch-mute-cmd",
  sourceId: string,
  key?: string,
  preMuteSliderValue: number,
  muted: boolean,
} | {
  type: "display-inline-channels-cmd",
  display: boolean
};

export type AudioMixerSource = {
  id: string,
  key?: string
}

type AudioMixerSubscription = { id: string, key?: string, gain: AudioGainNode }

export type GainRange = { minGain: number, maxGain: number }

export const defaultGainRange: GainRange = {
  minGain: -40,
  maxGain: 40,
}

export default class AudioMixerDefinition implements ServerComponentDefinition<AudioMixerSettings, AudioMixer, AudioMixerState, AudioMixerCommand, AudioMixerEvent> {
  async create(norsk: Norsk, cfg: AudioMixerSettings, cb: OnCreated<AudioMixer>, { updates }: StudioRuntime<AudioMixerState, AudioMixerEvent>) {
    const node = new AudioMixer(norsk, updates, cfg);
    await node.initialised
    cb(node);
  }
  handleCommand(node: AudioMixer, command: AudioMixerCommand) {
    const commandType = command.type
    switch (commandType) {
      case "set-gain-cmd": {
        const gainNode = node.gainNodes[mkSourceKey(command.sourceId, command.key)]
        if (gainNode) {
          // master out already corrected to -40
          let newGain = command.sourceId === "mixer-output" ? command.value : mkNodeGain(command.value)
          if (command.value && command.value < defaultGainRange.minGain) {
            newGain = null
          }
          gainNode.updateConfig({ channelGains: [newGain, newGain] });
          node.sendSetGainEvent(command.sourceId, command.value, newGain, command.key)
        }
        break;
      }
      case "switch-mute-cmd": {
        const gainNode = node.gainNodes[mkSourceKey(command.sourceId, command.key)]
        if (gainNode) {
          if (command.muted) {
            gainNode.updateConfig({ channelGains: [null, null] });
          } else {
            gainNode.updateConfig({ channelGains: [mkNodeGain(command.preMuteSliderValue), mkNodeGain(command.preMuteSliderValue)] });
          }
          node.sendSwitchMuteEvent(command.sourceId, command.muted, command.preMuteSliderValue, command.key)
        }
        break;
      }
      case "display-inline-channels-cmd": {
        node.sendDisplayInlineChannelsEvent(command.display)
        break
      }
      default:
        assertUnreachable(commandType)
    }
  }
}

function mkNodeGain(sliderGain: number): Db {
  // If below min, mute the channel
  return sliderGain < defaultGainRange.minGain ? null : sliderGain - 40
}

export class AudioMixer extends CustomAutoDuplexNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<AudioMixerState, AudioMixerEvent>;

  cfg: AudioMixerSettings;
  audioGainOutput?: AudioGainNode;
  audioLevelsOutput?: AudioMeasureLevelsNode;
  audioMixer?: AudioMixNode<string>;
  sendSetGainEvent: (sourceId: string, sliderGain: number, actualGain: Db, key?: string) => void;
  sendSwitchMuteEvent: (sourceId: string, muted: boolean, preMuteSliderValue: number, key?: string) => void;
  sendDisplayInlineChannelsEvent: (display: boolean) => void;

  knownSources: AudioMixerSource[] = [];
  gainNodes: { [sourceIdWithKey: string]: AudioGainNode } = {}
  sourceSubscriptions: StudioNodeSubscriptionSource[] = []
  sourcesSubscribedTo: { [id: MediaNodeId]: [AudioMixerSource, StreamKey][] } = {}
  audioMixerSubscriptions: AudioMixerSubscription[] = []

  constructor(norsk: Norsk, updates: RuntimeUpdates<AudioMixerState, AudioMixerEvent>, cfg: AudioMixerSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
    this.knownSources = [];
    this.sendSetGainEvent = (sourceId, sliderGain, nodeGain, key) => { updates.raiseEvent({ type: "set-gain", sourceId, key, sliderGain, nodeGain }) }
    this.sendSwitchMuteEvent = (sourceId, muted, preMuteSliderValue, key) => { updates.raiseEvent({ type: "switch-mute", sourceId, muted, preMuteSliderValue, key }) }
    this.sendDisplayInlineChannelsEvent = (display) => { updates.raiseEvent({ type: "display-inline-channels", display }) }
  }

  async initialise() {
    const mixerSettings: AudioMixSettings<string> = {
      id: `audio-mixer-${this.cfg.id}`,
      sampleRate: 48000, // TODO in config?
      sources: [],
      outputSource: "mixer-source",
      channelLayout: this.cfg.channelLayout,
    }
    const audioMixer = await this.norsk.processor.transform.audioMix(mixerSettings);
    this.audioMixer = audioMixer;
    const gainId = "mixer-output"
    const audioGain = await this.norsk.processor.transform.audioGain({
      id: gainId,
      channelGains: new Array(getAmountOfChannels(this.cfg.channelLayout)).fill(0)
    })
    audioGain.subscribe([{ source: audioMixer, sourceSelector: selectAudio }])
    this.audioGainOutput = audioGain
    this.audioLevelsOutput = await this.norsk.processor.control.audioMeasureLevels({
      id: "mixer-output-levels",
      onData: (levels: AudioMeasureLevels) => {
        const total = levels.channelLevels.reduce<{ rms: number, peak: number }>((acc, l) => {
          acc.peak += l.peak ?? 0;
          acc.rms += l.rms ?? 0
          return acc;
        }, { rms: 0, peak: 0 })
        this.updates.raiseEvent({
          type: 'audio-levels',
          sourceId: gainId,
          levels: {
            peak: levels.channelLevels.length == 0 ? 0 : total.peak / levels.channelLevels.length,
            rms: levels.channelLevels.length == 0 ? 0 : total.rms / levels.channelLevels.length
          }
        })
      }
    });
    this.audioLevelsOutput?.subscribe([{ source: audioGain, sourceSelector: selectAudio }])
    this.knownSources.push({ id: gainId })
    this.gainNodes[gainId] = audioGain
    this.updates.raiseEvent({ type: "set-gain", sourceId: "mixer-output", sliderGain: this.cfg.defaultGain, nodeGain: 0 })
    this.setup({ input: audioGain, output: [audioGain] })
  }

  override subscribe(subs: StudioNodeSubscriptionSource[]): void {
    subs.forEach((sub) => {
      sub.registerForContextChange(this);
      this.sourceSubscriptions.push(sub)
    })
    void this.sourceContextChange(() => { });
  }

  public async sourceContextChange(_responseCallback: (error?: SubscriptionError) => void): Promise<boolean> {
    return false;
  }

  // The below just looks like nonsense and needs re-writing

  //   const mkSubscriptions = (s: StudioNodeSubscriptionSource): [AudioMixerSource, ReceiveFromAddressAuto][] => {
  //     const isAlreadyKnown = (currentId: string, currentKey?: string) => this.knownSources.some(({ id, key }) => currentId === id && currentKey === key)
  //     const sType = s.streams.type;
  //     switch (sType) {
  //       case 'take-all-streams':
  //         return s.availableSourceKeys().map((key) => {
  //           if (!isAlreadyKnown(s.source.id, key)) this.knownSources.push({ id: s.source.id, key });
  //           return [{ id: s.source.id, key }, s.selsens e anuectAudioForKey(key)]
  //         })
  //       case 'take-first-stream':
  //         if (!isAlreadyKnown(s.source.id)) this.knownSources.push({ id: s.source.id });
  //         return [[{ id: s.source.id }, s.selectAudio()]];

  //       case 'take-specific-stream':
  //         if (!isAlreadyKnown(s.source.id)) this.knownSources.push({ id: s.source.id });
  //         return [[{ id: s.source.id }, s.selectAudio()]];
  //       case 'take-specific-streams':
  //         return s.activeSourceKeys().map((key) => {
  //           if (!isAlreadyKnown(s.source.id, key)) this.knownSources.push({ id: s.source.id, key });
  //           return [{ id: s.source.id, key }, s.selectAudioForKey(key)]
  //         })
  //       default:
  //         assertUnreachable(sType);
  //     }
  //   }

  //   const canSubscribe = (acc: [AudioMixerSource, StreamKey, ReceiveFromAddressAuto[]][], [{ id, key }, sub]: [AudioMixerSource, ReceiveFromAddressAuto[]]): [AudioMixerSource, StreamKey, ReceiveFromAddressAuto[]][] => {
  //     const stream = sub.source.outputStreams.find(({ streamKey }) => streamKey.sourceName === key || streamKey.sourceName === id)
  //     if (stream) {
  //       let subscribedStreams: [AudioMixerSource, StreamKey][] = []
  //       if (sub.source.id) {
  //         subscribedStreams = this.sourcesSubscribedTo[sub.source.id] || []
  //       }
  //       const alreadySubscribed = subscribedStreams.some(([existingSub, _streamKey]) => existingSub.id === id && existingSub.key === key)
  //       if (!alreadySubscribed) acc.push([{ id, key }, stream.streamKey, sub])
  //       return acc
  //     }
  //     return acc
  //   }
  //   const mkGain = async ([{ id, key }, streamKey, sub]: [AudioMixerSource, StreamKey, ReceiveFromAddressAuto]): Promise<AudioMixerSubscription> => {
  //     const sourceId = sub.source.id || "unknown" // TODO what if no media node id?
  //     if (!this.sourcesSubscribedTo[sourceId]) this.sourcesSubscribedTo[sourceId] = []
  //     this.sourcesSubscribedTo[sourceId].push([{ id, key }, streamKey])
  //     const nodeId = pinName(id, key)
  //     const channelGains: Db[] = new Array(getAmountOfChannels(this.cfg.channelLayout)).fill(this.cfg.defaultGain)
  //     const buildMultiChannel = await this.norsk.processor.transform.audioBuildMultichannel({
  //       channelLayout: this.cfg.channelLayout,
  //       sampleRate: 48000, // TODO in config?
  //       channelList: new Array(getAmountOfChannels(this.cfg.channelLayout)).fill(streamKey),
  //       outputStreamKey: {
  //         streamId: 1,
  //         sourceName: "source",
  //         programNumber: 1,
  //         renditionName: "merged-" + nodeId,
  //       },
  //     })
  //     buildMultiChannel.subscribe([sub])
  //     const gain = await this.norsk.processor.transform.audioGain({ id: `gain-${nodeId}`, channelGains })
  //     const levels = await this.norsk.processor.control.audioMeasureLevels({
  //       id: `levels-${nodeId}`,
  //       onData: (levels: AudioMeasureLevels) => {
  //         const total = levels.channelLevels.reduce<{ rms: number, peak: number }>((acc, l) => {
  //           acc.peak += l.peak ?? 0;
  //           acc.rms += l.rms ?? 0
  //           return acc;
  //         }, { rms: 0, peak: 0 })
  //         this.updates.raiseEvent({
  //           type: 'audio-levels',
  //           sourceId: id,
  //           key,
  //           levels: {
  //             peak: levels.channelLevels.length == 0 ? 0 : total.peak / levels.channelLevels.length,
  //             rms: levels.channelLevels.length == 0 ? 0 : total.rms / levels.channelLevels.length
  //           }
  //         })
  //       }
  //     });
  //     gain.subscribe([{ source: buildMultiChannel, sourceSelector: selectAudio }])
  //     levels.subscribe([{ source: gain, sourceSelector: selectAudio }])
  //     this.gainNodes[mkSourceKey(id, key)] = gain
  //     return { id: id, key, gain }
  //   }

  //   const subsWithStreams = this.sourceSubscriptions.filter((s) => s.latestStreams().some((s) => s.metadata.message.case == "audio"));

  //   const checkDroppedStreams = (s: StudioNodeSubscriptionSource) => {
  //     const outputStreams = s.latestStreams();
  //     const mediaNodeId = s.source.id || "unknown"
  //     const runningStreams = (this.sourcesSubscribedTo[mediaNodeId] || [])
  //     const subsStreamKeys = outputStreams.map((s) => s.metadata.streamKey)
  //     if (runningStreams.length > subsStreamKeys.length) {
  //       const droppedStreams = runningStreams.filter(([_, streamKey]) => {
  //         return !subsStreamKeys.some((subStreamKey) => streamKeysAreEqual(subStreamKey, streamKey))
  //       })
  //       droppedStreams.forEach(([{ id, key }, _]) => {
  //         this.updates.raiseEvent({ type: "source-dropped", sourceId: id, key })
  //       })
  //     }
  //   }

  //   this.sourceSubscriptions.forEach(checkDroppedStreams)

  //   const nodeSubs: [AudioMixerSource, StreamKey, ReceiveFromAddressAuto][] = subsWithStreams.flatMap(mkSubscriptions).reduce(canSubscribe, [])
  //   const gains = nodeSubs.flatMap(mkGain)
  //   Promise.all(gains).then((allTheGains) => {
  //     const mkSource = (g: { id: string, key?: string }) => {
  //       return { pin: pinName(g.id, g.key), channelGains: new Array(getAmountOfChannels(this.cfg.channelLayout)).fill(0) }
  //     }
  //     this.audioMixerSubscriptions.push(...allTheGains)
  //     this.audioMixer?.updateConfig({ sources: this.audioMixerSubscriptions.map(mkSource) })
  //     this.audioMixer?.subscribeToPins(this.audioMixerSubscriptions.map(({ id, gain, key }) => {
  //       return { source: gain, sourceSelector: audioToPin(pinName(id, key)) }
  //     }))
  //     this.updates.raiseEvent({ type: "sources-discovered", sources: this.knownSources })
  //   }).catch((e) => {
  //     console.error("Could not subscribe to audio gain nodes!", { error: e })
  //   })
  //   return false
  // }
}

// function pinName(sourceId: string, key?: string) {
//   if (key) {
//     return `${sourceId}__${key}`;
//   } else {
//     return sourceId;
//   }
// }
