import { Norsk, UdpTsInputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
export type UdpTsInputSettings = Pick<SdkSettings, 'interface' | 'timeout' | 'rtpDecapsulate' | 'sourceName' | 'host' | 'port'> & {
  id: string,
  displayName: string,
}

export default class UdpTsInputDefinition implements ServerComponentDefinition<UdpTsInputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: UdpTsInputSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () =>
      norsk.input.udpTs({ ...cfg })
    )
    await wrapper.initialised;
    cb(wrapper);
  }
}
