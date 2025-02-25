import path from 'path';
import { components } from './types';
import { schemaFromTypes } from '../shared/schemas';
import { BaseRtmpOutputDefinition } from '../output.rtmp/runtime';

export type YoutubeOutputSettings = components['schemas']['youtubeOutputSettings']

export default class YoutubeOutputDefinition extends BaseRtmpOutputDefinition<YoutubeOutputSettings> {
  async getConfig(cfg: YoutubeOutputSettings) {
    return {
      url: `rtmps://x.rtmps.youtube.com:443/live2/${cfg.streamKey}`,
    }
  }

  async schemas() {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'youtubeOutputSettings' }
    )
  }
}


