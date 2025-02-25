import type { TwitchOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function({
  defineComponent,
  All,
  validation: { Z },
}: Registration) {
  return defineComponent<TwitchOutputSettings>({
    identifier: 'output.twitch',
    category: 'output',
    name: "Twitch Live",
    description: "Stream directly to Twitch using RTMP",
    subscription: {
      accepts: {
        type: 'single-stream',
        media: All
      },
    },
    display: (_desc) => {
      return {
      }
    },
    configForm: {
      form: {
        streamKey: {
          help: "Twitch Stream Key (from Twitch Creator Dashboard)",
          hint: {
            type: 'text',
            validation: Z.string().min(1),
          }
        },
        notes: {
          help: "Additional notes about this component",
          hint: {
            type: 'text',
            optional: true
          }
        },
      }
    }
  });
}
