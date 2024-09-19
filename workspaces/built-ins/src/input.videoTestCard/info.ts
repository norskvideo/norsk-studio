import type { VideoTestcardGeneratorSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";


// Outputs a single stream
export default function({
  defineComponent,
  Video,
  validation: { SourceName },
  common: { Resolutions, FrameRates } }: Registration) {
  return defineComponent<VideoTestcardGeneratorSettings>({
    identifier: 'input.videoTestCard',
    category: 'input',
    name: "Video Test Card",
    description: "The Video Test Card component generates a test card video stream with customizable settings.",
    subscription: {
      accepts: undefined,
      produces: {
        type: "single-stream",
        media: Video
      }
    },
    display: (desc) => {
      return {
        resolution: desc.config.resolution.width.toString() + "x" + desc.config.resolution.height.toString(),
        frameRate: desc.config.frameRate.frames.toString() + "/" + desc.config.frameRate.seconds.toString(),
        pattern: desc.config.pattern
      }
    },
    configForm: {
      form: {
        resolution: { help: "The resolution of the test card stream", hint: { type: 'select', options: Resolutions, defaultValue: { width: 1280, height: 720 } } },
        frameRate: { help: "The frame rate of the test card stream", hint: { type: 'select', options: FrameRates, defaultValue: { frames: 25, seconds: 1 } } },
        sourceName: { help: "Source name to use for this test card stream", hint: { type: 'text', validation: SourceName, defaultValue: "video" } },
        pattern: {
          help: "The pattern on the test card stream", hint: {
            defaultValue: 'black',
            type: 'select', options: [
              { value: "black", display: "Black" },
              { value: "smpte75", display: "SMPTE75" },
              { value: "smpte100", display: "SMPTE100" }
            ]
          }
        },
      }
    }
  });
}
