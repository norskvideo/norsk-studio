import { defineRtmpOutputComponent } from "../output.rtmp/info";
import type { FacebookOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function(r: Registration) {
  const { validation: { Z } } = r;
  return defineRtmpOutputComponent<FacebookOutputSettings>(r, {
    identifier: 'output.Facebook',
    name: "Facebook Live",
    description: "Stream directly to Facebook Live using RTMP",
    configForm: {
      form: {
        streamKey: {
          help: "Facebook Stream Key",
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
