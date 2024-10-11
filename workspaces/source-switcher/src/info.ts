import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { SourceSwitchCommand, SourceSwitchConfig, SourceSwitchEvent, SourceSwitchState } from "./runtime";
import React from "react";
import { GlobalIceServers, HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";

export default function(R: Registration) {
  const {
    defineComponent,
    Av,
    common: { Resolutions, FrameRates }
  } = R;
  const InlineView = React.lazy(async () => import('./inline-view'));
  const SummaryView = React.lazy(async () => import('./summary-view'));
  const FullscreenView = React.lazy(async () => import('./fullscreen-view'));

  return defineComponent<SourceSwitchConfig, SourceSwitchState, SourceSwitchCommand, SourceSwitchEvent>({
    identifier: 'processor.sourceSwitcher',
    category: 'processor',
    name: "Source Switcher",
    description: "This component manages multiple A/V (audio and video) streams from different sources, switching between the sources dynamically.",
    subscription: {
      accepts: {
        type: 'multi-stream',
        media: Av
      },
      produces: {
        type: "single-stream",
        media: Av
      }
    },
    extraValidation: (ctx) => {
      // Each input *has* to come with video AND audio
      // and they can't come from different sources
      // We might want a 'join' node for that purpose ( :-( )
      ctx.subscriptions.forEach((s) => {
        if (s.validatedStreams.select.includes("audio") && s.validatedStreams.select.includes("video")) {
          return;
        }
        ctx.addError("Each subscription for Source Switcher must contain both video *and* audio, subscription to " + s.source + " only contains " + s.validatedStreams.select.join(","));
      })
    },
    display: (desc) => {
      return {
        resolution: desc.config.resolution.width.toString() + "x" + desc.config.resolution.height.toString(),
        frameRate: desc.config.frameRate.frames.toString() + "/" + desc.config.frameRate.seconds.toString(),
      }
    },
    css: [
      "style.css",
      "tailwind.css"
    ],
    runtime: {
      initialState: () => ({
        activeSource: { id: '' },
        activeOverlays: [],
        availableSources: [],
        knownSources: [],
        players: []
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case 'active-source-changed':
            return { ...state, activeSource: ev.activeSource, activeOverlays: ev.overlays };
          case 'source-online':
            state.availableSources.push(ev.source);
            return { ...state };
          case 'player-online':
            state.players.push({ source: ev.source, player: ev.url });
            return { ...state };
          case 'preview-player-online':
            state.previewPlayerUrl = ev.url;
            return { ...state };
          case 'source-offline': {
            const sourceIndex = state.availableSources.findIndex((s) => s.key == ev.source.key && s.id == ev.source.id);
            const playerIndex = state.players.findIndex((s) => s.source.key == ev.source.key && s.source.id == ev.source.id);
            if (sourceIndex >= 0)
              state.availableSources.splice(sourceIndex, 1);
            if (playerIndex >= 0)
              state.players.splice(playerIndex, 1);
            return { ...state };
          }
          case "sources-discovered": {
            state.knownSources = ev.sources;
            return { ...state }
          }
          default:
            assertUnreachable(evType);
        }
      },
      inline: InlineView,
      summary: SummaryView,
      fullscreen: FullscreenView
    },
    configForm: {
      global: {
        iceServers: GlobalIceServers(R),
        hardware: HardwareSelection()
      },
      form: {
        resolution: {
          help: "All video will be normalised to this resolution", hint: { type: 'select', options: Resolutions, defaultValue: { width: 1920, height: 1080 } }
        },
        frameRate: {
          help: "All video will be normalised to this frame rate", hint: { type: 'select', options: FrameRates, defaultValue: { frames: 25, seconds: 1 } }
        },
        sampleRate: {
          help: "All audio will be normalised to this sample rate",
          hint: {
            defaultValue: 48000,
            type: 'select', options: [
              { value: 48000, display: "48000" },
              { value: 44100, display: "44100" }
            ]
          }
        },
        channelLayout: {
          help: "All audio will be normalised to this channel layout",
          hint: {
            defaultValue: "stereo",
            type: 'select', options: [
              { value: "mono", display: "Mono" },
              { value: "stereo", display: "Stereo" }
            ]
          }
        },
      },
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
