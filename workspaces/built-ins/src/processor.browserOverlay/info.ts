import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { BrowserOverlayCommand, BrowserOverlayConfig, BrowserOverlayEvent, BrowserOverlayState } from "./runtime";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";
import React from "react";

const SummaryView = React.lazy(async () => import('./summary-view'));
const InlineView = React.lazy(async () => import('./inline-view'));

export default function({
  defineComponent,
  Video,
  validation: { Z },
}: Registration) {
  return defineComponent<BrowserOverlayConfig, BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>({
    identifier: 'processor.browserOverlay',
    category: 'processor',
    name: "Browser Overlay",
    description: 'Capture a live URL and overlay onto a video',
    subscription: {
      // Only accept a single video stream
      accepts: {
        type: 'single-stream',
        media: Video
      },
      produces: {
        type: "single-stream",
        media: Video
      }
    },
    extraValidation: function(ctx) {
      ctx.requireVideo(1);
    },
    display: (desc) => {
      return {
        url: desc.config.url
      }
    },
    runtime: {
      summary: SummaryView,
      inline: InlineView,
      initialState: () => ({
        currentUrl: "",
        enabled: true
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "url-changed":
            return { ...state, currentUrl: ev.url };
          case "enabled":
            return { ...state, enabled: true };
          case "disabled":
            return { ...state, enabled: false};
          default:
            assertUnreachable(evType)
        }
      }
    },
    configForm: {
      global: {
        hardware: HardwareSelection()
      },
      form: {
        url: { help: "URL to render on top of the video", hint: { type: 'text', validation: Z.string().url(), defaultValue: "" } },
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
