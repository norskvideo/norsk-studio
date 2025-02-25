import path from 'path';
import { components } from './types';
import { schemaFromTypes } from '../shared/schemas';
import { BaseRtmpOutputDefinition } from '../output.rtmp/runtime';

export type FacebookOutputSettings = components['schemas']['facebookOutputSettings'];

export default class FacebookOutputDefinition extends BaseRtmpOutputDefinition<FacebookOutputSettings> {
  async getConfig(cfg: FacebookOutputSettings) {
    return {
      url: `rtmps://live-api-s.facebook.com:443/rtmp/${cfg.streamKey}`,
    }
  }

  async schemas() {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'facebookOutputSettings' }
    )
  }
}


