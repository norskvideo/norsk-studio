import type { SrtOutputSettings } from "./runtime";
import type Registration from "norsk-studio/lib/extension/registration";
import React from "react";
import srtSocketOptions from '../shared/srt-socket-options';

export default function(registration: Registration) {
  const {
    defineComponent,
    All,
    validation,
  } = registration;
  const { Port, IpAddress, JitterBuffer, SrtPassphrase, SrtStreamId } = validation;
  const SocketConfiguration = React.lazy(async () => {
    const views = await import('../shared/srt-form-views')
    return { default: views.SocketConfiguration }
  });

  return defineComponent<SrtOutputSettings>({
    identifier: 'output.srt',
    category: 'output',
    name: "SRT Egest",
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
        ip: desc.config.ip,
        mode: desc.config.mode,
        bufferDelayMs: desc.config.bufferDelayMs?.toString() ?? 'none'
      }
    },
    configForm: {
      form: {
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
        ip: { help: "The IP address this SRT output will connect to or listen on", hint: { type: 'text', validation: IpAddress, defaultValue: "0.0.0.0" } },
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
        passphrase: { help: "Optional: Authentication for this SRT output", hint: { type: 'text', validation: SrtPassphrase } },
        streamId: { help: "Optional: StreamId to use when calling a remote listener", hint: { type: 'text', validation: SrtStreamId } },
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
