import { Norsk } from '@norskvideo/norsk-sdk';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import path from 'path';
import { components } from './types';
import { schemaFromTypes } from '../shared/schemas';

export type YoutubeOutputSettings = components['schemas']['youtubeOutputSettings']

export default class YoutubeOutputDefinition implements ServerComponentDefinition<YoutubeOutputSettings, SimpleSinkWrapper> {
  async create(norsk: Norsk, cfg: YoutubeOutputSettings, cb: OnCreated<SimpleSinkWrapper>) {
    const wrapper = new SimpleSinkWrapper(cfg.id, async () => {
      return await norsk.output.rtmp({
        url: `rtmps://x.rtmps.youtube.com:443/live2/${cfg.streamKey}`,
      });
    })
    await wrapper.initialised;
    cb(wrapper);
  }

  async schemas() {
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'youtubeOutputSettings' }
    )
  }
}


