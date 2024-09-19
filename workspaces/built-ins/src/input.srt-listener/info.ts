import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { SrtInputEvent, SrtInputSettings, SrtInputState } from "./runtime"
import React from "react";
const InlineView = React.lazy(async () => import('./inline-view'));
const SummaryView = React.lazy(async () => import('./summary-view'));
import srtSocketOptions from '../shared/srt-socket-options';

export default function({
  defineComponent,
  Av,
  validation }: Registration) {
  const { Z, Port, IpAddress, SourceName, SrtPassphrase, unique } = validation;
  const SocketConfiguration = React.lazy(async () => {
    const views = await import('../shared/srt-form-views')
    return { default: views.SocketConfiguration }
  });

  return defineComponent<SrtInputSettings, SrtInputState, object, SrtInputEvent>(
    {
      identifier: 'input.srt-listener',
      category: 'input',
      name: "SRT Ingest (Listener)",
      description: "This component handles media ingest via the SRT(Secure Reliable Transport) protocol. It acts as a listener, receiving media streams from remote SRT sources and is highly configurable, allowing for custom IP addresses, ports, and stream handling behaviours.",
      subscription: {
        accepts: undefined,
        produces: {
          type: "fixed-list",
          possibleMedia: Av,
          keys: (cfg) => cfg.streamIds.map((s) => ({
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
          port: desc.config.port.toString(),
          ip: desc.config.ip
        }
      },
      runtime: {
        initialState: () => ({ connectedStreams: [] }),
        handleEvent(ev, state) {
          const evType = ev.type;
          switch (evType) {
            case "source-connected":
              state.connectedStreams.push(ev.streamId)
              break;
            case "source-disconnected":
              state.connectedStreams = state.connectedStreams.filter((streamId) => streamId !== ev.streamId)
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
          port: {
            help: "The port this SRT input will listen on", hint: {
              type: 'numeric',
              validation: Port,
              defaultValue: 5001,
              global: unique('port'),
              envOverride: true
            }
          },
          ip: {
            help: "The IP address this SRT input will listen on",
            hint: {
              type: 'text',
              validation: IpAddress,
              defaultValue: "0.0.0.0",
              envOverride: true
            }
          },
          passphrase: {
            help: "Optional: Authentication for this SRT input",
            hint: {
              type: 'text',
              optional: true,
              validation: SrtPassphrase,
              envOverride: true,
            }
          },
          socketOptions: {
            help: "Socket Options",
            hint: {
              type: "form-item",
              view: SocketConfiguration,
              form: srtSocketOptions(validation)
            }
          },
          sourceNames: {
            help: 'Either auto assign streams in the order they come in, or restrict connections to those with known stream ids', hint: {
              type: "select",
              options: [
                { value: 'permissive', display: 'Auto Assign' },
                { value: 'strict', display: 'Restrict' },
              ],
              defaultValue: 'permissive',
            }
          },
          streamIds: {
            help: 'List of stream ids to assign to the accepted streams',
            hint: {
              type: "list",
              defaultValue: ['camera1'],
              validation: Z.array(SourceName),
              global: unique('sourceName')
            }
          },
        }
      }
    });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
