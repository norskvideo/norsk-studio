import React from "react";
import type { PreviewOutputCommand, PreviewOutputEvent, PreviewOutputSettings, PreviewOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import { GlobalIceServers, HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";

export default function(R: Registration) {
  const {
    defineComponent,
    Av,
    validation: { JitterBuffer },
  } = R;
  const InlineView = React.lazy(async () => import('./inline-view'));

  return defineComponent<PreviewOutputSettings, PreviewOutputState, PreviewOutputCommand, PreviewOutputEvent>({
    identifier: 'output.preview',
    category: 'output',
    name: "Preview",
    description: "Preview allows for the real-time preview of media streams. It provides a way to visualize and monitor the output from various media sources before final processing or distribution.",
    subscription: {
      accepts: {
        type: "single-stream",
        media: Av
      },
      produces: undefined
    },
    extraValidation: (ctx) => {
      const video = ctx.subscriptions.filter((s) => s.validatedStreams.select.includes("video"));
      const audio = ctx.subscriptions.filter((s) => s.validatedStreams.select.includes("audio"));
      if (video.length == 1 && audio.length == 1) return;
      if (video.length == 0) {
        ctx.addError("Preview requires a video subscription in order to work")
      }
      if (audio.length == 0) {
        ctx.addError("Preview requires an audio subscription in order to work")
      }
      if (video.length > 1) {
        ctx.addError("Preview cannot work with more than one video subscription")
      }
      if (audio.length > 1) {
        ctx.addError("Preview cannot work with more than one audio subscription")
      }
    },
    display: (_desc) => { return {}; },
    css: ["styles.css"],
    runtime: {
      initialState: () => ({}),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'url-published':
            state.url = ev.url;
            break;
          case 'audio-levels':
            state.levels = ev.levels;
            break;
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
      inline: InlineView
    },
    configForm: {
      global: {
        iceServers: GlobalIceServers(R),
        hardware: HardwareSelection()
      },
      form: {
        previewMode: {
          help: "How to display the video",
          hint: {
            type: 'select',
            defaultValue: 'image',
            options: [
              { value: 'video_encode', display: 'WebRTC (Re-Encode)' },
              { value: 'video_passthrough', display: 'WebRTC (Passthrough)' },
              { value: 'images', display: 'JPEG Only' }
            ]
          }
        },
        showPreview: { help: "Show video preview", hint: { type: 'boolean', defaultValue: true } },
        bufferDelayMs: { help: "How many milliseconds in the jitter buffer (WebRTC only)", hint: { type: 'numeric', validation: JitterBuffer, defaultValue: 500.0 } },
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

export const hardwareNames = [
  'quadra',
  'nvidia'
] as const

export type HardwareName = typeof hardwareNames[number];
