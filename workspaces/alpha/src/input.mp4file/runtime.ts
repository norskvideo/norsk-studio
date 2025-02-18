import { Norsk, FileMp4InputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';

export type FileMp4InputSettings = Pick<SdkSettings, 'fileName' > & {
  id: string,
  displayName: string,
  startTime?: number,
}

export default class FileMp4InputDefinition implements ServerComponentDefinition<FileMp4InputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: FileMp4InputSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {
        const input = await norsk.input.fileMp4({sourceName: `filemp4-${cfg.id}`,
                                                 start: "paused",
                                                 ...cfg });

        if (cfg.startTime !== undefined) {
          input.seek(cfg.startTime * 1000);
        }
        input.play();
        return input;
      }
    )
    await wrapper.initialised;
    cb(wrapper);
  }
}
