import React from "react";
import type { Ma35DStatsOutputCommand, Ma35DStatsOutputEvent, Ma35DStatsOutputSettings, Ma35DStatsOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function(R: Registration) {
  const {
    defineComponent,
  } = R;
  const InlineView = React.lazy(async () => import('./inline-view'));

  return defineComponent<Ma35DStatsOutputSettings, Ma35DStatsOutputState, Ma35DStatsOutputCommand, Ma35DStatsOutputEvent>({
    identifier: 'util.stats.ma35d',
    category: 'output',
    name: "MA35D Stats",
    subscription: {
      accepts: undefined,
      produces: undefined
    },
    display: (_desc) => { return {}; },
    runtime: {
      initialState: () => ({
        decoder: new Array(200).fill(0),
        scaler: new Array(200).fill(0),
        encoder: new Array(200).fill(0),
      }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case "new-stats": {
            state.decoder.push(ev.decoder);
            state.scaler.push(ev.scaler);
            state.encoder.push(ev.encoder);

            while (state.decoder.length > 200) {
              state.decoder.splice(0, 1);
              state.scaler.splice(0, 1);
              state.encoder.splice(0, 1);
            }
            break;
          }
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
      inline: InlineView
    },
    configForm: {
      form: {}
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
