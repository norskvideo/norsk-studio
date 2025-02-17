import { AacProfile, ChannelLayout, Norsk, SampleRate } from "@norskvideo/norsk-sdk";
import { SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';

export type AudioEncoderConfig = {
  id: string,
  displayName: string,
  notes?: string,
  renditionName: string,
  channelLayout: ChannelLayout,
  bitrate: number,
  codec: {
    kind: 'aac',
    profile: AacProfile,
    sampleRate: SampleRate,
  } | {
    kind: 'opus',
  },
};

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
}

