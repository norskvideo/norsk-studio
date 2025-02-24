import { Norsk } from '@norskvideo/norsk-sdk';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { components } from './types';
import path from 'path';
import fs from 'fs/promises';
import YAML from 'yaml';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';

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
        const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
        const root = YAML.parse(types.toString());
        const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
        return {
          config: resolved.components!.schemas!['twitchOutputSettings']
        }
      }
}
