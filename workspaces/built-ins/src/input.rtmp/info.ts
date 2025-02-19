import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { RtmpInputEvent, RtmpInputState, RtmpInputSettings } from "./runtime"
import React from "react";
const InlineView = React.lazy(async () => import('./inline-view'));
const SummaryView = React.lazy(async () => import('./summary-view'));

const defaultPort = 1935;

export default function({
  defineComponent,
  Av,
  validation: { Z, Port, SourceName, unique } }: Registration) {
  return defineComponent<RtmpInputSettings, RtmpInputState, object, RtmpInputEvent>(
    {
      identifier: 'input.rtmp',
      category: 'input',
      name: "RTMP Ingest",
      description: "A component that listens for RTMP input on the address specified.",
      subscription: {
        accepts: undefined,
        produces: {
          type: "fixed-list",
          possibleMedia: Av,
          keys: (cfg) => cfg.streamNames.map((s) => ({
            key: s,
            display: s,
            media: Av
          })),
          selector: (selection, metadata) => {
            return metadata.filter((m) => {
              return selection.includes(m.streamKey.sourceName)
            }).map((s) => s.streamKey)
          },
        }
      },
      display: (desc) => {
        return {
          port: desc.config.port ? desc.config.port.toString() : defaultPort.toString()
        }
      },
      runtime: {
        initialState: () => ({ connectedStreams: [], disabledStreams: [] }),
        handleEvent(ev, state) {
          const evType = ev.type;
          switch (evType) {
            case "source-connected":
              state.connectedStreams.push(ev.streamName)
              break;
            case "source-disconnected":
              state.connectedStreams = state.connectedStreams.filter((s) => s !== ev.streamName)
              break;
            case "source-enabled":
              state.disabledStreams = state.disabledStreams.filter((streamName) => streamName !== ev.streamName)
              break;
            case "source-disabled":
              state.disabledStreams.push(ev.streamName)
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
          port: { help: "The port this RTMP input will listen on", hint: { type: 'numeric', validation: Port, defaultValue: defaultPort, global: unique('port') } },
          ssl: { help: "Optional: SSL", hint: { type: 'boolean', optional: true } },
          appName: { help: "Name of the app", hint: { envOverride: true, type: "text", validation: Z.string().min(1), defaultValue: 'norsk' } },
          streamNames: {
            help: 'List of stream names to assign to the accepted streams',
            hint: {
              envOverride: true,
              type: "list",
              defaultValue: ['camera1'],
              validation: Z.array(SourceName),
              global: unique('sourceName')
            }
          },
          notes: {
            help: "Additional notes about this component",
            hint: {
              type: 'text',
              optional: true
            }
          },
        }
      }
    });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
