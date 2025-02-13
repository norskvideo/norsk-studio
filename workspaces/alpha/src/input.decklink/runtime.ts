import { Norsk, DeckLinkInputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';

export type DeckLinkInputSettings = Pick<SdkSettings, 'cardIndex' | 'channelLayout' | 'videoConnection'> & {
  id: string,
  displayName: string,
}

export default class DeckLinkInputDefinition implements ServerComponentDefinition<DeckLinkInputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: DeckLinkInputSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () =>
      norsk.input.deckLink({sourceName: `decklink-${cfg.id}`, ...cfg })
    )
    await wrapper.initialised;
    cb(wrapper);
  }
}
