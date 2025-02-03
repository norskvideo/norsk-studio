import type { SrtOutputCommand, SrtOutputEvent, SrtOutputSettings, SrtOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import React from "react";
import srtSocketOptions from '../shared/srt-socket-options';
import { assertUnreachable } from "@norskvideo/norsk-studio/lib/shared/util";

export default function(registration: Registration) {
  const {
    defineComponent,
    All,
    validation,
  } = registration;
  const { Port, Hostname, JitterBuffer, SrtPassphrase, SrtStreamId } = validation;
  const SocketConfiguration = React.lazy(async () => {
    const views = await import('../shared/srt-form-views')
    return { default: views.SocketConfiguration }
  });

  return defineComponent<SrtOutputSettings, SrtOutputState, SrtOutputCommand, SrtOutputEvent>({
    identifier: 'output.srt',
    category: 'output',
    name: "SRT Egest",
    description: "This component manages the sending of SRT (Secure Reliable Transport) streams. It allows you to configure various settings to control how the SRT output is handled, including connection details, buffer settings, and delay options.",
    subscription: {
      // No validation?
      // Streams have to be unique? That's a stretch goal
      accepts: {
        type: "multi-stream",
        media: All
      },
    },
    display: (desc) => {
      return {
        port: desc.config.port?.toString() ?? '',
        host: desc.config.host,
        mode: desc.config.mode,
        bufferDelayMs: desc.config.bufferDelayMs?.toString() ?? 'none'
      }
    },
    runtime: {
      initialState: () => ({
        enabled: true,
      }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'output-enabled':
            state.enabled = true;
            break;
          case 'output-disabled':
            state.enabled = false;
            break;
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
    },
    configForm: {
      form: {
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
        port: {
          help: "The port this SRT output will connect to or listen on",
          hint: {
            type: 'numeric',
            validation: Port,
            defaultValue: 5101,
            global: {
              constraint: 'unique',
              key: "port",
              include: (cfg) => cfg.mode == "listener"
            },
          }
        },
        host: { help: "The IP address/Hostname this SRT output will connect to or listen on", hint: { type: 'text', validation: Hostname, defaultValue: "0.0.0.0" } },
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 500.0 } },
        avDelayMs: { help: "How many milliseconds to delay A/V to account for subtitles/ancillary data", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 50.0 } },
        mode: {
          help: "Whether this SRT Output is calling a remote host, or listening on this host", hint: {
            defaultValue: "listener",
            type: 'select', options: [{
              value: "listener",
              display: "Listener"
            },
            {
              value: "caller",
              display: "Caller"
            }]
          }
        },
        passphrase: { help: "Optional: Authentication for this SRT output", hint: { type: 'text', optional: true, validation: SrtPassphrase } },
        streamId: { help: "Optional: StreamId to use when calling a remote listener", hint: { type: 'text', optional: true, validation: SrtStreamId } },
        socketOptions: {
          help: "Socket Options",
          hint: {
            type: "form-item",
            view: SocketConfiguration,
            form: srtSocketOptions(validation)
          }
        }
      }
    }
  });
}
