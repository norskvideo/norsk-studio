import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { WhisperTranscribeConfig } from "./runtime";

export default function({
  defineComponent,
  Av,
  Subtitle,
  validation: { Z }
}: Registration) {
  return defineComponent<WhisperTranscribeConfig>({
    identifier: 'processor.whisper-transcribe',
    category: 'processor',
    name: "Whisper Transcribe",
    description: "This component transcribes audio from a video stream.",
    subscription: {
      accepts: {
        type: 'single-stream',
        media: Av // video because we'll use the id of it..
      },
      produces: {
        media: Subtitle,
        type: "single-stream",
      }
    },
    extraValidation: function(ctx) {
      const video = ctx.videoInputs();
      const audio = ctx.audioInputs();
      if (video.length !== 1) {
        ctx.addError("Whisper Transcribe requires a single video stream to use as a reference")
      }
      if (audio.length !== 1) {
        ctx.addError("Whisper Transcribe requires a single audio stream to transcribe")
      }
    },
    display: (desc) => {
      return {
        model: desc.config.model
      }
    },
    configForm: {
      form: {
        model: { help: "The ggml model path", hint: { type: 'text', validation: Z.string().min(1, "Choosing a model is mandatory") } },
        translate: { help: "Whether to translate the output to English", hint: { type: 'boolean', optional: true, defaultValue: false } },
        language: { help: "Source language (otherwise automatic)", hint: { type: 'text', optional: true, validation: Z.union([Z.string().length(0), Z.string().min(1)]) } },
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
      }
    }
  });
}
