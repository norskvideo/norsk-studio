import { Norsk, VideoTestcardGeneratorSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from 'norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition } from 'norsk-studio/lib/extension/runtime-types';


export type VideoTestcardGeneratorSettings = Pick<SdkSettings, 'resolution' | 'frameRate' | 'sourceName' | 'pattern'> & {
  id: string,

  displayName: string,
};

export default class VideoTestCardDefinition implements ServerComponentDefinition<VideoTestcardGeneratorSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: VideoTestcardGeneratorSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper: SimpleInputWrapper = new SimpleInputWrapper(cfg.id, async () => {
      return await norsk.input.videoTestCard({ ...cfg });
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
