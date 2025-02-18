import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { SrtInputSettings } from "./runtime"
import srtSocketOptions from '../shared/srt-socket-options';

import React from "react";

export default function({
  defineComponent,
  Av,
  validation: validation
}: Registration) {
  const { Port, Hostname, SourceName, SrtPassphrase, SrtStreamId } = validation;
  const SocketConfiguration = React.lazy(async () => {
    const views = await import('../shared/srt-form-views')
    return { default: views.SocketConfiguration }
  });
  return defineComponent<SrtInputSettings>(
    {
      identifier: 'input.srt-caller',
      category: 'input',
      name: "SRT Ingest (Caller)",
      description: "This component allows you to receive Secure Reliable Transport (SRT) streams by calling a remote SRT listener.",
      subscription: {
        accepts: undefined,
        produces: {
          type: "single-stream",
          media: Av
        }
      },
      display: (desc) => {
        return {
          port: desc.config.port.toString(),
          ip: desc.config.host
        }
      },
      configForm: {
        form: {
          port: { help: "The port this SRT input will connect to", hint: { type: 'numeric', validation: Port, defaultValue: 5001 } },
          host: { help: "The IP address/hostname this SRT input will connect to", hint: { type: 'text', validation: Hostname, defaultValue: "0.0.0.0" } },
          sourceName: { help: "Source name to identify this by", hint: { type: 'text', validation: SourceName, defaultValue: "camera1" } },
          passphrase: { help: "Optional: Authentication for this SRT input", hint: { type: 'text', optional: true, validation: SrtPassphrase } },
          streamId: { help: "Optional: StreamId to use when calling the remote listener", hint: { type: 'text', optional: true, validation: SrtStreamId } },
          socketOptions: {
            help: "Socket Options",
            hint: {
              type: "form-item",
              view: SocketConfiguration,
              form: srtSocketOptions(validation)
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
