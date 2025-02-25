import { components } from './types';
import path from 'path';
import { schemaFromTypes } from '../shared/schemas';
import { BaseRtmpOutputDefinition } from '../output.rtmp/runtime';

export type TwitchOutputSettings = components['schemas']['twitchOutputSettings'];

export default class TwitchOutputDefinition extends BaseRtmpOutputDefinition<TwitchOutputSettings> {
  async getConfig(cfg: TwitchOutputSettings) {
    return {
      url: `rtmp://live.twitch.tv/app/${cfg.streamKey}`
    };
  }

  async schemas() {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'twitchOutputSettings' }
    )
  }
}
