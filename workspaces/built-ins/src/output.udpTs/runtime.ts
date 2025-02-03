import { Norsk, UdpTsOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

export type UdpTsOutputSettings = Pick<SdkSettings, 'port' | 'destinationHost' | 'interface' | 'bufferDelayMs' | 'avDelayMs'> & {
  id: string,
  displayName: string,
  notes?: string,
};

export default class UdpTsOutputDefinition implements ServerComponentDefinition<UdpTsOutputSettings, SimpleSinkWrapper> {
  async create(norsk: Norsk, cfg: UdpTsOutputSettings, cb: OnCreated<SimpleSinkWrapper>) {
    const wrapper = new SimpleSinkWrapper(cfg.id, async () => {
      return await norsk.output.udpTs(cfg);
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
