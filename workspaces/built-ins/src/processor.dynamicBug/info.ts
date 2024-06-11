import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { DynamicBugConfig } from "./runtime";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";


export default function({
  defineComponent,
  Video,
  validation: { Z },
}: Registration) {
  return defineComponent<DynamicBugConfig>({
    identifier: 'processor.transform.dynamicBug',
    category: 'processor',
    name: "Dynamic Bug",
    subscription: {
      // Only accept a single video stream
      accepts: {
        type: 'single-stream',
        media: Video
      },
      produces: {
        type: "single-stream",
        media: Video
      }
    },
    extraValidation: function(ctx) {
      ctx.requireVideo(1);
    },
    display: (desc) => {
      return {
        url: desc.config?.url
      }
    },
    configForm: {
      global: {
        hardware: HardwareSelection()
      },
      form: {
        url: { help: "URL to render on top of the video", hint: { type: 'text', validation: Z.string().url(), defaultValue: "" } },
      }
    }
  });
}
