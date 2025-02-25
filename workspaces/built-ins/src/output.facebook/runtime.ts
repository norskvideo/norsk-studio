import { Norsk } from '@norskvideo/norsk-sdk';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import path from 'path';
import { components } from './types';
import { schemaFromTypes } from '../shared/schemas';

export type FacebookOutputSettings = components['schemas']['facebookOutputSettings'];

export default class FacebookOutputDefinition implements ServerComponentDefinition<FacebookOutputSettings, SimpleSinkWrapper> {
  async create(norsk: Norsk, cfg: FacebookOutputSettings, cb: OnCreated<SimpleSinkWrapper>) {
    const wrapper = new SimpleSinkWrapper(cfg.id, async () => {
      return await norsk.output.rtmp({
        url: `rtmps://live-api-s.facebook.com:443/rtmp/${cfg.streamKey}`,
      });
    })
    await wrapper.initialised;
    cb(wrapper);
  }

  async schemas() {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'facebookOutputSettings' }
    )
  }
}


