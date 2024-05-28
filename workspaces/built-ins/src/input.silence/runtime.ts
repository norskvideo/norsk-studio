import { AudioSignalGeneratorNode, ChannelLayout, Norsk, SampleRate, getAmountOfChannels, selectAudio } from '@norskvideo/norsk-sdk';

import { OnCreated, ServerComponentDefinition } from 'norsk-studio/lib/extension/runtime-types';
import { CustomSourceNode } from 'norsk-studio/lib/extension/base-nodes';

export type SilenceConfig = {
  id: string,
  displayName: string,
  sampleRate: SampleRate,
  channelLayout: ChannelLayout
}

export default class SilenceSourceDefinition implements ServerComponentDefinition<SilenceConfig, SilenceSource> {
  async create(norsk: Norsk, cfg: SilenceConfig, cb: OnCreated<SilenceSource>) {
    const node = await SilenceSource.create(norsk, cfg);
    cb(node);
  }
}

export class SilenceSource extends CustomSourceNode {
  norsk: Norsk;
  cfg: SilenceConfig;
  signal?: AudioSignalGeneratorNode;
  initialised: Promise<void>;

  static async create(norsk: Norsk, cfg: SilenceConfig) {
    const node = new SilenceSource(cfg, norsk);
    await node.initialised;
    return node;
  }

  constructor(cfg: SilenceConfig, norsk: Norsk) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
    this.initialised = this.initialise();
  }

  async initialise() {
    const signal = await this.norsk.input.audioSignal({
      id: `${this.cfg.id}-signal`,
      sourceName: `audio-signal-${this.cfg.id}`,
      channelLayout: this.cfg.channelLayout,
      sampleRate: this.cfg.sampleRate,
    });
    const gain = await this.norsk.processor.transform.audioGain({
      id: `${this.cfg.id}-gain`,
      channelGains: new Array(getAmountOfChannels(this.cfg.channelLayout)).fill(-80.0),
    });
    gain.subscribe([
      { source: signal, sourceSelector: selectAudio }
    ])
    this.setup({ output: [gain] });
    this.signal = signal;
  }

  override async close() {
    await super.close();
    await this.signal?.close();
  }
}
