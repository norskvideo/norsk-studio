import { Norsk, VideoDecodeSettings } from "@norskvideo/norsk-sdk";
import { SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';

export type VideoDecoderConfig = {
  id: string,
  displayName: string,
  notes?: string,
  mode: VideoDecodeSettings["decoder"]
};

export default class VideoDecoderDefinition implements ServerComponentDefinition<VideoDecoderConfig, SimpleProcessorWrapper> {
  async create(norsk: Norsk, cfg: VideoDecoderConfig, cb: OnCreated<SimpleProcessorWrapper>) {
    const wrapper = new SimpleProcessorWrapper(cfg.id, async () => {
      return await norsk.processor.transform.videoDecode({
        id: `${cfg.id}-ladder`,
        decoder: cfg.mode
      });
    });
    await wrapper.initialised;
    cb(wrapper);
  }
}

