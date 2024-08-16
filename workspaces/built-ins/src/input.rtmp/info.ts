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
      path: __dirname,
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
        initialState: () => ({ connectedSources: [] }),
        handleEvent(ev, state) {
          const evType = ev.type;
          switch (evType) {
            case "source-connected":
              state.connectedSources.push(ev.streamName)
              break;
            case "source-disconnected":
              state.connectedSources = state.connectedSources.filter((s) => s !== ev.streamName)
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
          ssl: { help: "Optional: SSL", hint: { type: 'boolean' } },
          appName: { help: "Name of the app", hint: { type: "text", validation: Z.string().min(1), defaultValue: 'norsk' } },
          streamNames: {
            help: 'List of stream names to assign to the accepted streams',
            hint: {
              type: "list",
              defaultValue: ['camera1'],
              validation: Z.array(SourceName),
              global: unique('sourceName')
            }
          }
        }
      }
    });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
