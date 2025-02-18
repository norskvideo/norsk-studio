import type { UdpTsOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";


export default function({
  defineComponent,
  All,
  validation: { Port, Hostname, JitterBuffer, Iface, Z },
}: Registration) {
  return defineComponent<UdpTsOutputSettings>({
    identifier: 'output.udpTs',
    category: 'output',
    name: "UDP TS Egest",
    description: "This component outputs multiple media streams over UDP in TS (Transport Stream) format. It accepts multiple input streams and sends them to a specified IP address and port.",
    subscription: {
      // Just works with no validation
      // although uniqueness again, stretch goal
      accepts: {
        type: 'multi-stream',
        media: All
      },
    },
    display: (desc) => {
      return {
        port: desc.config.port.toString(),
        destinationIp: desc.config.destinationHost,
        interface: desc.config.interface,
        bufferDelayMs: desc.config.bufferDelayMs?.toString() ?? 'none'
      }
    },
    configForm: {
      form: {
        port: { help: "The port this UDP TS output will send to", hint: { type: 'numeric', validation: Port, defaultValue: 8001 } },
        destinationHost: { help: "The IP address/Hostname this UDP TS output will send to", hint: { type: 'text', validation: Hostname, defaultValue: "127.0.0.1" } },
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 500.0 } },
        interface: { help: "Which interface to bind to for publishing", hint: { type: 'text', validation: Z.union([Z.string().length(0), Iface]), defaultValue: "any" } },
        notes: { 
          help: "Additional notes about this component", 
          hint: { type: 'text', optional: true } 
        },
      }
    }
  });
}
