import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { OnscreenGraphicCommand, OnscreenGraphicConfig, OnscreenGraphicEvent, OnscreenGraphicState } from "./runtime";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";
import React from "react";

export default function ({
  defineComponent,
  Video
}: Registration) {
  const GraphicSelection = React.lazy(async () => import('./image-selection'));
  const SummaryView = React.lazy(async () => import('./summary-view'));

  return defineComponent<OnscreenGraphicConfig, OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>({
    identifier: 'processor.onscreenGraphic',
    category: 'processor',
    name: 'Onscreen Graphic',
    description: 'Overlay graphics onto a video',
    subscription: {
      // Only accept a single video stream
      accepts: {
        type: 'single-stream',
        media: Video
      },
      produces: {
        type: 'single-stream',
        media: Video
      }
    },
    extraValidation: function (ctx) {
      ctx.requireVideo(1);
    },
    display: (desc) => {
      return {
        default: desc.config.initialGraphic ?? 'none',
      }
    },
    runtime: {
      summary: SummaryView,
      initialState: () => ({
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "graphic-changed":
            return { ...state, activeGraphic: { file: ev.file, position: ev.position } };
          case "video-changed":
            return { ...state, currentVideo: ev.currentVideo };
          case "graphic-loaded":
            return { ...state, currentGraphic: ev.currentGraphic };
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
        initialGraphic: {
          help: "The initial graphic to render on the video (if any)",
          hint: {
            type: "custom",
            optional: true,
            component: GraphicSelection,
          }
        },
        initialPosition: {
          help: "The initial location at which to render the graphic",
          hint: {
            type: 'select',
            optional: true,
            options: [
              { value: { type: "named", position: "topleft" }, display: 'Top Left' },
              { value: { type: "named", position: "topright" }, display: 'Top Right' },
              { value: { type: "named", position: "bottomleft" }, display: 'Bottom Left' },
              { value: { type: "named", position: "bottomright" }, display: 'Bottom Right' },
              { value: { type: "named", position: "center" }, display: 'Centered' }
            ]
          }
        }
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}

