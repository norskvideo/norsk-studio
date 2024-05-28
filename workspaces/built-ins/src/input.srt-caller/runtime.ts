import { Norsk, SrtInputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { SocketOptions } from '../shared/srt-types';
import { SimpleInputWrapper } from 'norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition } from 'norsk-studio/lib/extension/runtime-types';

export type SrtInputSettings = Pick<SdkSettings, 'port' | 'ip' | 'sourceName' | 'passphrase' | 'streamId'> & {
  id: string,
  displayName: string,
  socketOptions: SocketOptions
};

export default class SrtInputDefinition implements ServerComponentDefinition<SrtInputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: SrtInputSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {
      return await norsk.input.srt({ mode: 'caller', ...cfg });
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
