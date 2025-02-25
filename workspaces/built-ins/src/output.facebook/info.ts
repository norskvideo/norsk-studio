import type { FacebookOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function({
  defineComponent,
  All,
  validation: { Z },
}: Registration) {
  return defineComponent<FacebookOutputSettings>({
    identifier: 'output.Facebook',
    category: 'output',
    name: "Facebook Live",
    description: "Stream directly to Facebook Live using RTMP",
    subscription: {
      accepts: {
        type: 'single-stream',
        media: All
      },
    },
    display: () => {
      return {
      }
    },
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
