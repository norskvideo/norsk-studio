import type { UdpTsOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";


export default function({
  defineComponent,
  All,
  validation: { Port, IpAddress, JitterBuffer, Iface, Z },
}: Registration) {
  return defineComponent<UdpTsOutputSettings>({
    identifier: 'output.udpTs',
    category: 'output',
    name: "UDP TS Egest",
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
        destinationIp: desc.config.destinationIp,
        interface: desc.config.interface,
        bufferDelayMs: desc.config.bufferDelayMs?.toString() ?? 'none'
      }
    },
    configForm: {
      form: {
        port: { help: "The port this UDP TS output will send to", hint: { type: 'numeric', validation: Port, defaultValue: 8001 } },
        destinationIp: { help: "The IP address this UDP TS output will send to", hint: { type: 'text', validation: IpAddress, defaultValue: "127.0.0.1" } },
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 500.0 } },
        interface: { help: "Which interface to bind to for publishing", hint: { type: 'text', validation: Z.union([Z.string().length(0), Iface]), defaultValue: "any" } },
      }
    }
  });
}
