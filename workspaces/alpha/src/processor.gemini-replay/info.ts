import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { GeminiReplayConfig } from "./runtime";

export default function({
  defineComponent,
  Av,
}: Registration) {
  return defineComponent<GeminiReplayConfig>({
    identifier: 'processor.gemini-replay',
    category: 'processor',
    name: "Gemini Replay",
    description: "This component is a proof-of-concept of using Google Gemini to do action replays.",
    subscription: {
      accepts: {
        type: 'single-stream',
        media: Av 
      },
      produces: {
        type: 'single-stream',
        media: Av 
      }
    },
    extraValidation: function(ctx) {
      const video = ctx.videoInputs();
      const audio = ctx.audioInputs();
      if (video.length > 1) {
        ctx.addError("Gemini Replay cannot process multiple video streams")
      }
      if (audio.length > 1) {
        ctx.addError("Gemini Replay cannot process multiple audio streams")
      }
    },
    display: (desc) => {
      return {
        preRollMs: desc.config.preRollMs.toString(),
        durationMs: desc.config.durationMs.toString(),
        ignoreWindowMs: desc.config.ignoreWindowMs.toString(),
      }
    },
    configForm: {
      form: {
        systemInstruction: { help: "The Gemini system instruction", hint: {type: 'text', defaultValue: "I will send you a stream of audio/video from a football match with a frame rate of 5 frames per second.  You must ignore any clocks or other text on the video. I want you to continuously monitor the audio/video and when you see any goal occurring (which would be accompanied by the players celebrating), I want you to call the action_detected function passing the elapsed time into the video of the goal itself. "}},
        preRollMs: { help: "How long prior to the 'event' to start the replay", hint: { type: 'numeric', defaultValue: 5000}},
        durationMs:{ help: "How long to run the replay", hint: { type: 'numeric', defaultValue: 10000}},
        ignoreWindowMs: { help: "How long after one replay before allowing another", hint: { type: 'numeric', defaultValue: 20000}},
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
      }
    }
  });
}
