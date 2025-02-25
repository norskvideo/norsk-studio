import { defineRtmpOutputComponent } from "../output.rtmp/info";
import type { LinkedInOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function(r: Registration) {
  const { validation: { Z } } = r;
  return defineRtmpOutputComponent<LinkedInOutputSettings>(r, {
    identifier: 'output.LinkedIn',
    name: "LinkedIn Live",
    description: "Stream directly to LinkedIn Live using RTMP",
    configForm: {
      form: {
        streamUrl: {
          help: "LinkedIn Stream URL",
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
