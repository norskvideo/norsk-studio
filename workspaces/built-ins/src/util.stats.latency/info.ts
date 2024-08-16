import React from "react";
import type { LatencyStatsOutputCommand, LatencyStatsOutputEvent, LatencyStatsOutputSettings, LatencyStatsOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function(R: Registration) {
  const {
    defineComponent,
  } = R;
  const InlineView = React.lazy(async () => import('./inline-view'));
  const SourceNodeSelection = React.lazy(async () => import('./source-node-selection'));

  return defineComponent<LatencyStatsOutputSettings, LatencyStatsOutputState, LatencyStatsOutputCommand, LatencyStatsOutputEvent>({
    identifier: 'util.stats.latency',
    category: 'output',
    name: "Latency Probe",
    subscription: {
      accepts: undefined,
      produces: undefined
    },
    display: (_desc) => { return {}; },
    runtime: {
      initialState: () => ({
        values: new Array(200).fill(0),
      }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case "new-stats": {
            state.values.push(ev.value);
            while (state.values.length > 200) {
              state.values.splice(0, 1);
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
      form: {
        startNodeId: {
          help: "The node producing data that we want to measure from",
          hint: {
            type: 'custom',
            component: SourceNodeSelection,
            defaultValue: "",
            global: {
              constraint: 'custom',
              message: "startNode does not exist, did you delete it?",
              validate: function(c, document) {
                return !!document.findNode(c.startNodeId)
              },
            }
          }
        },
        endNodeId: {
          help: "Destination node",
          hint: {
            type: 'custom',
            component: SourceNodeSelection,
            defaultValue: "",
            global: {
              constraint: 'custom',
              message: "endNode does not exist, did you delete it?",
              validate: function(c, document) {
                return !!document.findNode(c.endNodeId)
              },
            }
          }
        },
      }
    },
    designtime: {
      uiEvents: {
        onGlobalNodeUpdated: function(this, node, id) {
          if (node.id !== id && id == this.config.startNodeId) {
            this.config.startNodeId = node.id;
          }
          if (node.id !== id && id == this.config.endNodeId) {
            this.config.endNodeId = node.id;
          }
        },
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
