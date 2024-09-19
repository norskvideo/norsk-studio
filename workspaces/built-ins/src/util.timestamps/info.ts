import React from "react";
import type { TimestampOutputCommand, TimestampOutputEvent, TimestampOutputSettings, TimestampOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function(R: Registration) {
  const {
    defineComponent,
    All
  } = R;
  const InlineView = React.lazy(async () => import('./inline-view'));

  return defineComponent<TimestampOutputSettings, TimestampOutputState, TimestampOutputCommand, TimestampOutputEvent>({
    identifier: 'util.timestamps',
    category: 'output',
    name: "Jitter",
    description: "A jitter utility which processes and tracks timestamps.",
    subscription: {
      accepts: {
        type: "multi-stream",
        media: All
      },
      produces: undefined
    },
    display: (_desc) => { return {}; },
    runtime: {
      initialState: () => ({
        timestamps: new Array(200).fill(0),
      }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case "new-timestamp": {
            const target = state.timestamps.find((e) => e.key === ev.key) ??
              (() => {
                const start = { key: ev.key, startTimeMs: new Date().valueOf(), startTimestamp: ev.value, timestamps: [] };
                state.timestamps.push(start);
                return start;
              })()
            target.timestamps.push({ ts: ev.value, wall: ev.wallMs });

            while (target.timestamps.length > 200) {
              target.timestamps.splice(0, 1);
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

export const hardwareNames = [
  'quadra',
  'nvidia'
] as const

export type HardwareName = typeof hardwareNames[number];
