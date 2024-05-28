import React from "react";
import type { AudioLevelCommand, AudioLevelEvent, AudioLevelSettings, AudioLevelState } from "./runtime";
import type Registration from "norsk-studio/lib/extension/registration";

export default function({
  defineComponent,
  Audio,
  validation: { Z },
}: Registration) {

  const InlineView = React.lazy(async () => import('./inline-view'));
  const SummaryView = React.lazy(async () => import('./summary-view'));

  return defineComponent<AudioLevelSettings, AudioLevelState, AudioLevelCommand, AudioLevelEvent>({
    identifier: 'processor.audioLevel',
    category: 'processor',
    name: "Audio Levels",
    subscription: {
      // Only accept a single audio stream
      accepts: {
        type: "single-stream",
        media: Audio
      },
      produces: {
        type: "single-stream",
        media: Audio,
      }
    },
    extraValidation: function(ctx) {
      ctx.requireAudio(1);
    },
    display: (_desc) => { return {}; },
    css: ["styles.css"],
    runtime: {
      initialState: () => ({}),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'audio-levels':
            state.levels = ev.levels;
            break;
          case 'set-gain':
            state.sliderGain = ev.sliderGain
            state.nodeGain = ev.nodeGain
            break;
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
      inline: InlineView,
      summary: SummaryView,
    },
    configForm: {
      form: {
        defaultGain: { help: "The default gain for audio dB", hint: { type: 'numeric', validation: Z.number().gte(-40).lte(40), defaultValue: 0 } },
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
