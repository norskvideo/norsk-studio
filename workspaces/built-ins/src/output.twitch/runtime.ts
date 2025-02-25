import { Norsk } from '@norskvideo/norsk-sdk';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { components } from './types';
import path from 'path';
import { schemaFromTypes } from '../shared/schemas';

export type TwitchOutputSettings = components['schemas']['twitchOutputSettings'];

export default class TwitchOutputDefinition implements ServerComponentDefinition<TwitchOutputSettings, SimpleSinkWrapper> {
  async create(norsk: Norsk, cfg: TwitchOutputSettings, cb: OnCreated<SimpleSinkWrapper>) {
    const wrapper = new SimpleSinkWrapper(cfg.id, async () => {
      return await norsk.output.rtmp({
        url: `rtmp://live.twitch.tv/app/${cfg.streamKey}`
      });
    })
    await wrapper.initialised;
    cb(wrapper);
  }

  async schemas() {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'twitchOutputSettings' }
    )
  }
}
