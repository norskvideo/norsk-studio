import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { UdpTsInputSettings } from "./runtime"

export default function({
  defineComponent,
  Av,
  validation: { Z, Port, IpAddress, SourceName, unique } }: Registration) {
  return defineComponent<UdpTsInputSettings>(
    {
      identifier: 'input.udp-ts',
      category: 'input',
      name: "UDP TS ingest",
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
          ip: desc.config.ip
        }
      },
      configForm: {
        form: {
          port: { help: "The receiving port", hint: { type: 'numeric', validation: Port, defaultValue: 5001, global: unique('port') } },
          ip: { help: "The receiving IP address", hint: { type: 'text', validation: IpAddress, defaultValue: "127.0.0.1" } },
          sourceName: { help: "Source name to identify this by", hint: { type: 'text', validation: SourceName, defaultValue: "udp-ts", global: unique('sourceName') } },
          interface: { help: "Optional interface to bind to", hint: { type: 'text', optional: true, validation: Z.union([Z.string().min(2).max(32), Z.string().length(0)]).optional() } },
          timeout: { help: "Timeout in milliseconds before determining the input is closed", hint: { type: 'numeric', validation: Z.number().refine((value: number) => value > 0 && value < 600_000, "Timeout must be less than 10 minutes"), defaultValue: 1000.0 } },
          rtpDecapsulate: { help: "Whether to expect the input TS to be encapsulated in RTP via RFC 2250 (default: false)", hint: { type: "boolean" } }
        }
      }
    });
}
