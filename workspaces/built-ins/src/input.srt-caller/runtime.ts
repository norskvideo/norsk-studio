import { Norsk, SrtInputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { SocketOptions } from '../shared/srt-types';
import { SimpleInputWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';

export type SrtInputSettings = Pick<SdkSettings, 'port' | 'ip' | 'sourceName' | 'passphrase' | 'streamId'> & {
  id: string,
  displayName: string,
  socketOptions: SocketOptions
};

export default class SrtInputDefinition implements ServerComponentDefinition<SrtInputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: SrtInputSettings, cb: OnCreated<SimpleInputWrapper>, runtime: StudioRuntime) {
    runtime.updates.setAlert('disconnected', {
      message: 'SRT Caller is not connected',
      level: 'error'
    })
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {
      return await norsk.input.srt({
        mode: 'caller',
        onConnection: () => {
          runtime.updates.clearAlert('disconnected');
          return { accept: true, sourceName: cfg.id }
        },
        onConnectionStatusChange(status, _sourceName) {
          switch (status) {
            case 'disconnected':
              runtime.updates.setAlert('disconnected', {
                message: 'SRT Caller got disconnected',
                level: 'error'
              })
              break;
            default:
              assertUnreachable(status);

          }
        },
        ...cfg
      });
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
