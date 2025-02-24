import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { VideoDecoderConfig } from "./runtime";

export default function({
  defineComponent,
  Video,
}: Registration) {
  return defineComponent<VideoDecoderConfig>({
    identifier: 'processor.videoDecoder',
    category: 'processor',
    name: "Video Decoder",
    description: "Explicit video decode.",
    subscription: {
      accepts: {
        type: 'single-stream',
        media: Video
      },
      produces: {
        type: 'single-stream',
        media: Video
      },
    },
    display: ({ config }) => {
      const displayed: Record<string, string> = {
        acceleration: config.mode,
      };
      return displayed;
    },
    extraValidation: (ctx) => {
      ctx.requireVideo(1);
    },
    configForm: {
      form: {
        mode: {
          help: "Acceleration",
          hint: {
            type: 'select',
            defaultValue: "software",
            options: [
              { display: "Software", value: "software" },
              { display: "Quadra", value: "quadra" },
              { display: "Nvidia", value: "nvidia" },
            ],
          },
        },
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
      }
    }
  });
}
