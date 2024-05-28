import { AudioGainNode, AudioMeasureLevels, AudioMeasureLevelsNode, Db, Norsk, selectAudio } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from 'norsk-studio/lib/extension/runtime-types';
import { CustomAutoDuplexNode } from 'norsk-studio/lib/extension/base-nodes';

export type AudioLevelSettings = {
  id: string;
  displayName: string;
  defaultGain: Db;
};

export type AudioLevelState = {
  levels?: { peak: number, rms: number },
  sliderGain?: Db,
  nodeGain?: Db,
}

export type AudioLevelEvent = {
  type: 'audio-levels',
  levels: {
    peak: number,
    rms: number
  }
} | {
  type: "set-gain",
  sliderGain: Db,
  nodeGain: Db,
}

export type AudioLevelCommand = {
  type: "set-gain",
  value: number,
};

export default class AudioLevelDefinition implements ServerComponentDefinition<AudioLevelSettings, AudioLevel, AudioLevelState, AudioLevelCommand, AudioLevelEvent> {
  async create(norsk: Norsk, cfg: AudioLevelSettings, cb: OnCreated<AudioLevel>, { updates }: StudioRuntime<AudioLevelState, AudioLevelEvent>) {
    const node = new AudioLevel(norsk, updates, cfg);
    await node.initialised
    cb(node);
  }
  handleCommand(node: AudioLevel, command: AudioLevelCommand) {
    const commandType = command.type
    switch (commandType) {
      case "set-gain": {
        const newGain = mkNodeGain(command.value)
        node.audioGain?.updateConfig({ channelGains: [newGain, newGain] });
        node.sendSetGainEvent(command.value, newGain)
        break;
      }
    }
  }
}

function mkNodeGain(sliderGain: Db): Db {
  return (sliderGain || 0) - 40
}

class AudioLevel extends CustomAutoDuplexNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<AudioLevelState, AudioLevelEvent>;

  cfg: AudioLevelSettings;
  audioLevels?: AudioMeasureLevelsNode;
  audioGain?: AudioGainNode;
  source?: StudioNodeSubscriptionSource;
  sendSetGainEvent: (relativeGain: Db, actualGain: Db) => void;

  constructor(norsk: Norsk, updates: RuntimeUpdates<AudioLevelState, AudioLevelEvent>, cfg: AudioLevelSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
    this.sendSetGainEvent = (sliderGain, nodeGain) => { updates.raiseEvent({ type: "set-gain", sliderGain, nodeGain }) }
  }

  async initialise() {
    const defaultGain = mkNodeGain(this.cfg.defaultGain)
    const audioGain = await this.norsk.processor.transform.audioGain({
      id: `${this.cfg.id}-audio-gain`,
      channelGains: [defaultGain, defaultGain]
    })
    this.audioLevels = await this.norsk.processor.control.audioMeasureLevels({
      id: `${this.cfg.id}-audiolevels`,
      onData: (levels: AudioMeasureLevels) => {
        const total = levels.channelLevels.reduce<{ rms: number, peak: number }>((acc, l) => {
          acc.peak += l.peak ?? 0;
          acc.rms += l.rms ?? 0
          return acc;
        }, { rms: 0, peak: 0 })
        this.updates.raiseEvent({
          type: 'audio-levels',
          levels: {
            peak: levels.channelLevels.length == 0 ? 0 : total.peak / levels.channelLevels.length,
            rms: levels.channelLevels.length == 0 ? 0 : total.rms / levels.channelLevels.length
          }
        })
      }
    });
    this.audioGain = audioGain
    this.audioLevels.subscribe([{ source: this.audioGain, sourceSelector: selectAudio }])
    this.updates.raiseEvent({ type: "set-gain", sliderGain: this.cfg.defaultGain, nodeGain: -40 + (this.cfg.defaultGain || 0) })
    this.setup({ input: audioGain, output: [audioGain] })
  }

  override subscribe(sources: StudioNodeSubscriptionSource[]): void {
    if (sources.length < 1) return;
    const audioSource = sources.find((s) => s.streams.select.includes("audio"));
    if (!audioSource?.source.relatedMediaNodes.output) { return; }
    this.audioGain?.subscribe(audioSource.selectAudio());

  }
}
