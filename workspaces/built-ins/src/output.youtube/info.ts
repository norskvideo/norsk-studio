import { defineRtmpOutputComponent } from "../output.rtmp/info";
import type { YoutubeOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function(r: Registration) {
  const { validation: { Z } } = r;
  return defineRtmpOutputComponent<YoutubeOutputSettings>(r, {
    identifier: 'output.youtube',
    name: "YouTube Live",
    description: "Stream directly to YouTube Live using RTMP",
    configForm: {
      form: {
        streamKey: {
          help: "YouTube Stream Key",
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
