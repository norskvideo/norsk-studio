import type { NdiOutputSettings } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

export default function({
  defineComponent,
  All,
  validation: { JitterBuffer},
}: Registration) {
  return defineComponent<NdiOutputSettings>({
    identifier: 'output.ndi',
    category: 'output',
    name: "NDI Egest",
    description: "This component outputs a single video and/or audio stream over NDI.",
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
        name: desc.config.name,
        groups: desc.config.groups?.toString() ?? 'none',
        bufferDelayMs: desc.config.bufferDelayMs?.toString() ?? 'none'
      }
    },
    configForm: {
      form: {
        name: { help: "The NDI name announced for this output", hint: {type: 'text'}},
        groups: { help: "The NDI groups that this output is a member of", hint: {type: 'text'}},
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 0.0 } },
        notes: { 
          help: "Additional notes about this component", 
          hint: { type: 'text', optional: true } 
        },
      }
    }
  });
}
