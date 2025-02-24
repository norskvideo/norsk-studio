import type { LinkedInOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function({
  defineComponent,
  All,
  validation: { Z },
}: Registration) {
  return defineComponent<LinkedInOutputSettings>({
    identifier: 'output.LinkedIn',
    category: 'output',
    name: "LinkedIn Live",
    description: "Stream directly to LinkedIn Live using RTMP",
    subscription: {
      accepts: {
        type: 'multi-stream',
        media: All
      },
    },
    display: () => {
      return {
      }
    },
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