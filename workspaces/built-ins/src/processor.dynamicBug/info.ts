import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { DynamicBugCommand, DynamicBugConfig, DynamicBugEvent, DynamicBugState } from "./runtime";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";
import React from "react";


export default function({
  defineComponent,
  Video
}: Registration) {
  const BugSelection = React.lazy(async () => import('./bug-selection'));
  const SummaryView = React.lazy(async () => import('./summary-view'));

  return defineComponent<DynamicBugConfig, DynamicBugState, DynamicBugCommand, DynamicBugEvent>({
    identifier: 'processor.dynamicBug',
    category: 'processor',
    name: "Dynamic Bug",
    subscription: {
      // Only accept a single video stream
      accepts: {
        type: 'single-stream',
        media: Video
      },
      produces: {
        type: "single-stream",
        media: Video
      }
    },
    extraValidation: function(ctx) {
      ctx.requireVideo(1);
    },
    display: (desc) => {
      return {
        default: desc.config.defaultBug ?? 'none',
      }
    },
    runtime: {
      summary: SummaryView,
      initialState: () => ({
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "bug-changed":
            return { ...state, activeBug: { file: ev.file, position: ev.position } };
          default:
            assertUnreachable(evType)

        }
      }
    },
    configForm: {
      global: {
        hardware: HardwareSelection()
      },
      form: {
        defaultBug: {
          help: "The default bug to render on the video (if any)",
          hint: {
            type: "custom",
            component: BugSelection,
          }
        },
        defaultPosition: {
          help: "The default location to render the bug in",
          hint: {
            type: 'select',
            optional: true,
            options: [
              { value: 'topleft', display: 'Top Left' },
              { value: 'topright', display: 'Top Right' },
              { value: 'bottomleft', display: 'Bottom Left' },
              { value: 'bottomright', display: 'Bottom Right' }
            ]
          }
        }
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}

