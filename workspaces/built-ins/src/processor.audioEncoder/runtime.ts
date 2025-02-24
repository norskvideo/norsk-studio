import { Norsk } from "@norskvideo/norsk-sdk";
import { SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import path from 'path';
import fs from 'fs/promises';
import YAML from 'yaml';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';
import { components } from "./types";

export type AudioEncoderConfig = components['schemas']['audioEncoderConfig'];

export default class AudioEncoderDefinition implements ServerComponentDefinition<AudioEncoderConfig, SimpleProcessorWrapper> {
  async create(norsk: Norsk, cfg: AudioEncoderConfig, cb: OnCreated<SimpleProcessorWrapper>) {
    const wrapper = new SimpleProcessorWrapper(cfg.id, async () => {
      return await norsk.processor.transform.audioEncode({
        id: `${cfg.id}-ladder`,
        channelLayout: cfg.channelLayout,
        bitrate: cfg.bitrate,
        outputRenditionName: cfg.renditionName,
        codec: cfg.codec,
      });
    });
    await wrapper.initialised;
    cb(wrapper);
  }

  async schemas() {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
    return {
      config: resolved.components!.schemas!['audioEncoderConfig']
    }
  }
}

