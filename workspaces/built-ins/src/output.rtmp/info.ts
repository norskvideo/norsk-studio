import type { RtmpOutputEvent, RtmpOutputSettings, RtmpOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import React from "react";

export default function ({
  defineComponent,
  Av,
  validation: { Z, JitterBuffer },
}: Registration) {
  const SummaryView = React.lazy(async () => import('./summary-view'));
  const InlineView = React.lazy(async () => import('./inline-view'));

  return defineComponent<RtmpOutputSettings, RtmpOutputState, object, RtmpOutputEvent>({
    identifier: 'output.rtmp',
    category: 'output',
    name: "RTMP Egest",
    description: "This component handles the output of RTMP (Real-Time Messaging Protocol) streams. It is used to connect to a remote RTMP server and manage the streaming of media. ",
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
    display: (desc) => {
      return {
        url: desc.config.url
      };
    },
    runtime: {
      initialState: () => ({ connected: false, connectRetries: 0, enabled: true }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "rtmp-server-connected-and-publishing":
            state.connected = true;
            break;
          case "rtmp-server-connection-failed-retry":
            state.connected = false;
            state.connectRetries++;
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
      form: { 
        url: { help: "The URL of the remote RTMP server to connect to, including the full stream path and credentials", hint: { type: "text", validation: Z.string().min(5) } },
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 500.0 } },
        avDelayMs: { help: "How many milliseconds to delay A/V to account for subtitles", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 50.0 } },
        retryConnectionTimeout: { help: "Number of seconds to wait until a retry is attempted to the RTMP server", hint: { type: "numeric", validation: Z.number().min(1).max(10), defaultValue: 5 } },
        notes: { 
          help: "Additional notes about this component", 
          hint: { type: 'text', optional: true } 
        },
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
