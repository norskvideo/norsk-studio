import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { ActionReplayConfig, ActionReplayState, ActionReplayCommand, ActionReplayEvent } from "./runtime";
import React from "react";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";


export default function({
  defineComponent,
  assertUnreachable,
  Av,
}: Registration) {
  const SummaryView = React.lazy(async () => import('./summary'));

  return defineComponent<ActionReplayConfig, ActionReplayState, ActionReplayCommand, ActionReplayEvent>({
    identifier: 'processor.actionReplay',
    category: 'processor',
    name: "Action Replay",
    description: "This component replays media content upon request, managing both audio and video streams.",
    subscription: {
      accepts: {
        type: 'single-stream',
        media: Av
      },
      produces: {
        type: 'single-stream',
        media: Av
      },
    },
    extraValidation: (ctx) => {
      if (ctx.subscriptions.length == 0) { return; }
      if (ctx.subscriptions.length > 1) {
        ctx.addError("Action replay can only subscribe to a single source");
        return;
      }
      if (!ctx.subscriptions[0].validatedStreams.select.includes("audio")) {
        ctx.addError("Action replay requires audio in the subscription");
      }
      if (!ctx.subscriptions[0].validatedStreams.select.includes("video")) {
        ctx.addError("Action replay requires video in the subscription");
      }
    },
    runtime: {
      summary: SummaryView,
      initialState: () => ({
        replaying: false,
        contentPlayerUrl: undefined
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "content-player-created":
            return { ...state, contentPlayerUrl: ev.url }
          case "replay-started":
            return { ...state, replaying: true }
          case "replay-finished":
            return { ...state, replaying: false }
          default:
            return assertUnreachable(evType);
        }
      }
    },
    display: (desc) => {
      const { __global: _, ...rem } = desc.config;
      return rem;
    },
    configForm: {
      global: {
        hardware: HardwareSelection()
      },
      form: {
      }
    }
  });
}

export const hardwareNames = [
  'quadra',
  'nvidia'
] as const

export type HardwareName = typeof hardwareNames[number];

