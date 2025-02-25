import { Norsk } from "@norskvideo/norsk-sdk";
import { SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import path from 'path';
import { components } from "./types";
import { schemaFromTypes } from "../shared/schemas";

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
    return schemaFromTypes(path.join(__dirname, 'types.yaml'),
      { config: 'audioEncoderConfig' }
    )
  }
}

