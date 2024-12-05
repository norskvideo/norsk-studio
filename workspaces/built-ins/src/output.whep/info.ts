import type { WhepOutputCommand, WhepOutputEvent, WhepOutputSettings, WhepOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

import { GlobalIceServers } from '@norskvideo/norsk-studio/lib/shared/config'
import { assertUnreachable } from "@norskvideo/norsk-studio/lib/shared/util";

export default function(R: Registration) {
  const {
    defineComponent,
    Av,
    validation: { JitterBuffer },
  } = R;
  return defineComponent<WhepOutputSettings, WhepOutputState, WhepOutputCommand, WhepOutputEvent>({
    identifier: 'output.whep',
    category: 'output',
    name: "WHEP Egest",
    description: "This component allows us to use WebRTC egress for outputs.",
    subscription: {
      // No validation?
      // Accept either *just* audio, or *just* video, or audio *and* video
      // there can only be one of each though
      // The selection of these things should determine the subscriptionValidation callback
      // requireAV or just 'cool cool cool'
      accepts: {
        type: 'single-stream',
        media: Av
      },
    },
    display: (_desc) => { return {}; },
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
      global: {
        iceServers: GlobalIceServers(R)
      },
      form: {
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 500.0 } },
      }
    }
  });
}
