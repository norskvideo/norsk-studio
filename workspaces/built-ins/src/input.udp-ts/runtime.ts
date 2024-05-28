import { Norsk, UdpTsInputSettings as SdkSettings, requireAV, selectAll } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from 'norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition } from 'norsk-studio/lib/extension/runtime-types';
export type UdpTsInputSettings = Pick<SdkSettings, 'interface' | 'timeout' | 'rtpDecapsulate' | 'sourceName' | 'ip' | 'port'> & {
  id: string,
  displayName: string,
}

export default class UdpTsInputDefinition implements ServerComponentDefinition<UdpTsInputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: UdpTsInputSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {

      const udp = await norsk.input.udpTs({ ...cfg });

      // TODO this is bodged in for NAB AWS purposes
      const align = await norsk.processor.transform.streamAlign({
        frameRate: { frames: 25, seconds: 1 },
        sampleRate: 96000,
        syncAv: true
      })
      align.subscribe([{
        source: udp, sourceSelector: selectAll
      }], requireAV);

      return align;
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
