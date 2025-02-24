import type { YoutubeOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function({
  defineComponent,
  All,
  validation: { Z },
}: Registration) {
  return defineComponent<YoutubeOutputSettings>({
    identifier: 'output.youtube',
    category: 'output',
    name: "YouTube Live",
    description: "Stream directly to YouTube Live using RTMP",
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