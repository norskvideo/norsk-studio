import path from 'path';
import { components } from './types';
import { schemaFromTypes } from '../shared/schemas';
import { BaseRtmpOutputDefinition } from '../output.rtmp/runtime';

export type LinkedInOutputSettings = components['schemas']['linkedInOutputSettings'];

export default class LinkedInOutputDefinition extends BaseRtmpOutputDefinition<LinkedInOutputSettings> {
  async getConfig(cfg: LinkedInOutputSettings) {
    return {
      url: cfg.streamUrl,
    }
  }

  async schemas() {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'linkedInOutputSettings' }
    )
  }
}


