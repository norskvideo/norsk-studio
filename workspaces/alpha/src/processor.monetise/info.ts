import React from "react";
import type { MonetiseOutputCommand, MonetiseOutputEvent, MonetiseOutputSettings, MonetiseOutputState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import { GlobalIceServers, HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";

export default function(R: Registration) {
  const {
    defineComponent,
    Av,
  } = R;
  const SummaryView = React.lazy(async () => import('./summary'));

  return defineComponent<MonetiseOutputSettings, MonetiseOutputState, MonetiseOutputCommand, MonetiseOutputEvent>({
    identifier: 'processor.monetise',
    category: 'output',
    name: "Monetise",
    description: "Allows for the monetization of video and audio streams by incorporating ads and handling their lifecycle within the output stream.",
    subscription: {
      accepts: {
        type: "single-stream",
        media: Av
      },
      produces: {
        type: 'single-stream',
        media: ["audio", "video", "ancillary"]
      }
    },
    extraValidation: (ctx) => {
      ctx.requireVideo(1);
      ctx.requireAudio(1);
    },
    display: (_desc) => { return {}; },
    runtime: {
      initialState: () => ({}),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'url-published':
            state.url = ev.url;
            break;
          case 'advert-started':
            state.currentAdvert = { timeLeftMs: ev.durationMs };
            break;
          case 'advert-tick':
            state.currentAdvert = { timeLeftMs: ev.timeLeftMs };
            break;
          case 'advert-finished':
            state.currentAdvert = undefined;
            break;
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
      summary: SummaryView
    },
    configForm: {
      global: {
        iceServers: GlobalIceServers(R),
        hardware: HardwareSelection()
      },
      form: {
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
