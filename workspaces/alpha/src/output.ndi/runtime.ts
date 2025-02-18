import { Norsk, NdiOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

export type NdiOutputSettings = Pick<SdkSettings, 'name' | 'groups' | 'bufferDelayMs' > & {
  id: string,
  displayName: string,
  notes?: string,
};

export default class NdiOutputDefinition implements ServerComponentDefinition<NdiOutputSettings, SimpleSinkWrapper> {
  async create(norsk: Norsk, cfg: NdiOutputSettings, cb: OnCreated<SimpleSinkWrapper>) {
    const wrapper = new SimpleSinkWrapper(cfg.id, async () => {
      return await norsk.output.ndi(cfg);
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
