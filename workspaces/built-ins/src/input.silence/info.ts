import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { SilenceConfig } from "./runtime";

export default function({ defineComponent, Audio }: Registration) {
  return defineComponent<SilenceConfig>({
    identifier: 'input.silence',
    category: 'input',
    name: "Silence Generator",
    description: "A component that produces silent audio streams with configurable sample rate and channel layout.",
    subscription: {
      produces: {
        type: "single-stream",
        media: Audio
      }
    },
    display: (desc) => {
      return {
        sampleRate: desc.config.sampleRate.toString() + "Hz",
        channelLayout: desc.config.channelLayout.toString()
      }
    },
    configForm: {
      form: {
        sampleRate: {
          help: "Samplerate in Hz of the generated audio",
          hint: {
            type: 'select', options: [
              { value: 48000, display: "48000" },
              { value: 44100, display: "44100" }
            ],
            defaultValue: 48000,
          }
        },
        channelLayout: {
          help: "Channel layout of the generated audio",
          hint: {
            type: 'select', options: [
              { value: "mono", display: "Mono" },
              { value: "stereo", display: "Stereo" }
            ],
            defaultValue: "stereo"
          }
        },
      }
    }
  });
}

