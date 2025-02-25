import { defineRtmpOutputComponent } from "../output.rtmp/info";
import type { TwitchOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function(r: Registration) {
  const { validation: { Z } } = r;
  return defineRtmpOutputComponent<TwitchOutputSettings>(r, {
    identifier: 'output.twitch',
    name: "Twitch Live",
    description: "Stream directly to Twitch using RTMP",
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
