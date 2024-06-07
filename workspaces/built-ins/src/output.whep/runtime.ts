import { Norsk, WhepOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';

import { OnCreated, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

export type WhepOutputSettings = {
  id: string;
  displayName: string,
  bufferDelayMs?: SdkSettings['bufferDelayMs'];
  __global: {
    iceServers: string[];
  }
};

export default class WhepOutputDefinition implements ServerComponentDefinition<WhepOutputSettings, SimpleSinkWrapper> {
  async create(norsk: Norsk, cfg: WhepOutputSettings, cb: OnCreated<SimpleSinkWrapper>, { report }: StudioRuntime) {
    const wrapper = new SimpleSinkWrapper(cfg.id, async () => {
      const mappedCfg: SdkSettings = {
        id: cfg.id,
        bufferDelayMs: cfg.bufferDelayMs,
        iceServers: cfg.__global.iceServers.map((s) => ({ urls: [s] })), // not sure about turn
      };
      const node = await norsk.output.whep(mappedCfg);
      report.registerOutput(cfg.id, node.playerUrl);
      return node;
    });
    await wrapper.initialised;
    void cb(wrapper);
  }
}
