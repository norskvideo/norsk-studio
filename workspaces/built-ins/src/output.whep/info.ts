import { WhepOutputCommand, type WhepOutputEvent, type WhepOutputSettings, type WhepOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

import { GlobalIceServers } from '@norskvideo/norsk-studio/lib/shared/config'
import React from "react";
const SummaryView = React.lazy(async () => import('./summary-view'));


export default function(R: Registration) {
  const {
    defineComponent,
    Av,
    validation: { JitterBuffer },
  } = R;
  const InlineView = React.lazy(async () => import('./inline-view'));
  
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
    css: ["styles.css"],
    runtime: {
      initialState: () => ({ enabled: true }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'url-published':
            state.url = ev.url;
            break;
          case "output-enabled":
            state.enabled = true;
            break;
          case "output-disabled":
            state.enabled = false;
            break;
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
      inline: InlineView,
      summary: SummaryView
    },
    configForm: {
      global: {
        iceServers: GlobalIceServers(R)
      },
      form: {
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 500.0 } },
        showPreview: { help: "Show video preview", hint: {type: 'boolean', defaultValue: true }}
      },
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
