import React from "react";
import type { StatisticsOutputCommand, StatisticsOutputEvent, StatisticsOutputSettings, StatisticsOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function({
  defineComponent,
  All
}: Registration) {

  const InlineView = React.lazy(async () => import('./inline-view'));

  return defineComponent<StatisticsOutputSettings, StatisticsOutputState, StatisticsOutputCommand, StatisticsOutputEvent>({
    identifier: 'output.statistics',
    category: 'output',
    name: "Statistics",
    description: "This component accepts multiple media streams, captures and reports metrics or statistical data related to the media streams.",
    subscription: {
      // No validation required
      accepts: {
        type: "multi-stream",
        media: All
      },
    },
    display: (_desc) => { return {}; },
    runtime: {
      initialState: () => ({}),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'summary':
            state.previous = ev.summary;
            break;
          default:
            assertUnreachable(evType);
        }
        return { ...state };
      },
      inline: InlineView
    },
    configForm: {
      form: {
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
      }
    }
  });
}

export function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
