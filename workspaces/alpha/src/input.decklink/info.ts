import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { DeckLinkInputSettings } from "./runtime"
import { ChannelLayout } from "@norskvideo/norsk-sdk";

export default function({
  defineComponent,
  Av }: Registration) {
  return defineComponent<DeckLinkInputSettings>(
    {
      identifier: 'input.decklink',
      category: 'input',
      name: "DeckLink ingest",
      description: "This component receives video and audio streams from SDI or HDMI sources using Blackmagic DeckLink cards.",
      subscription: {
        accepts: undefined,
        produces: {
          type: "single-stream",
          media: Av
        }
      },
      display: (desc) => {
        return {
          cardIndex: desc.config.cardIndex.toString(),
          channelLayout: desc.config.channelLayout.toString(),
          videoConnection: desc.config.videoConnection.toString(),
        }
      },
      configForm: {
        form: {
          cardIndex: { help: "The card index", hint: { type: 'numeric', defaultValue: 0} },
          channelLayout: {
            help: "The source channel layout",
            hint:
            {
              type: "select",
              options: channelLayouts().map((ch) => { return { value: ch, display: ch as string } }),
            }
          },
          videoConnection: { help: "SDI or HDMI", hint: { type: 'select', options: [{value: "sdi", display: "SDI"},
                                                                                    {value: "hdmi", display: "HDMI"}]} },
        }
      }
    });
}

const channelLayouts = () => {
  const ch: ChannelLayout[] = [
    "mono", "stereo", "surround", "4.0", "5.0", "5.1", "7.1", "5.1.4", "7.1.4"
  ]
  return ch
}
