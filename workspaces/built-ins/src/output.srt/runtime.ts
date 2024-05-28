import { Norsk, SrtOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';

import { OnCreated, ServerComponentDefinition } from 'norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from 'norsk-studio/lib/extension/base-nodes';
import type { SocketOptions } from '../shared/srt-types';

export type SrtOutputSettings = Pick<SdkSettings, 'port' | 'ip' | 'mode' | 'passphrase' | 'streamId' | 'bufferDelayMs' | 'avDelayMs'> & {
  id: string,
  displayName: string,
  socketOptions: SocketOptions
};

export default class SrtOutputDefinition implements ServerComponentDefinition<SrtOutputSettings, SimpleSinkWrapper> {
  async create(norsk: Norsk, cfg: SrtOutputSettings, cb: OnCreated<SimpleSinkWrapper>) {
    const wrapper = new SimpleSinkWrapper(cfg.id, async () => {
      return norsk.output.srt({ ...cfg, ...cfg.socketOptions });
    });
    await wrapper.initialised;
    cb(wrapper);
  }
}
