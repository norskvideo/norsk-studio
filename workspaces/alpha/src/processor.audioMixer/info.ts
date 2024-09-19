import React from "react";
import { AudioMixerLevels, type AudioMixerCommand, type AudioMixerEvent, type AudioMixerSettings, type AudioMixerState } from "./runtime";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import { ChannelLayout } from "@norskvideo/norsk-sdk";

export function mkSourceKey(sourceId: string, key?: string) {
  return key ? sourceId + "-" + key : sourceId
}

export default function({
  defineComponent,
  Audio,
  validation: { Z },
}: Registration) {

  const InlineView = React.lazy(async () => import('./inline-view'));
  const FullscreenView = React.lazy(async () => import('./fullscreen-view'));
  const SummaryView = React.lazy(async () => import('./summary-view'))

  return defineComponent<AudioMixerSettings, AudioMixerState, AudioMixerCommand, AudioMixerEvent>({
    identifier: 'processor.audioMixer',
    category: 'processor',
    name: "Audio Mixer",
    description: "Combines and manages multiple audio streams into a single output stream, providing fine-grained control over audio levels, gain adjustments, and mute functionality for each source in the mix.",
    subscription: {
      accepts: {
        type: "multi-stream",
        media: Audio
      },
      produces: {
        type: "single-stream",
        media: Audio,
      }
    },
    extraValidation: function(ctx) {
      ctx.requireAudio(1);
    },
    display: (_desc) => { return {}; },
    css: ["styles.css"],
    runtime: {
      initialState: () => (
        {
          sources: {},
          knownSources: [],
          gainRange: { minGain: -40, maxGain: 40 },
          displayInlineChannels: true,
        }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'audio-levels': {
            const source = state.sources[mkSourceKey(ev.sourceId, ev.key)] || { isMuted: false, sliderGain: 0 }
            state.sources[mkSourceKey(ev.sourceId, ev.key)] = { ...source, levels: ev.levels, }
            break;
          }
          case 'set-gain': {
            const source = state.sources[mkSourceKey(ev.sourceId, ev.key)] || { isMuted: false, sliderGain: 0 }
            let isMuted = ev.nodeGain === null ? true : source.isMuted
            if (source.isMuted && typeof ev.nodeGain === "number") {
              isMuted = false
            }
            state.sources[mkSourceKey(ev.sourceId, ev.key)] = { ...source, sliderGain: ev.sliderGain, nodeGain: ev.nodeGain, isMuted }
            break;
          }
          case 'sources-discovered': {
            state.knownSources = ev.sources
            break;
          }
          case 'switch-mute': {
            const source = state.sources[mkSourceKey(ev.sourceId, ev.key)] || { isMuted: false, sliderGain: 0 }
            source.preMuteSliderGain = ev.preMuteSliderValue
            if (source) {
              if (ev.muted) {
                source.sliderGain = -99
              } else {
                source.sliderGain = ev.preMuteSliderValue
              }
            }
            state.sources[mkSourceKey(ev.sourceId, ev.key)] = { ...source, isMuted: ev.muted }
            break
          }
          case "source-dropped": {
            const keyToDelete = mkSourceKey(ev.sourceId, ev.key)
            const newSources: { [sourceIdAndKey: string]: AudioMixerLevels } = {}
            Object.keys(state.sources).forEach((s) => {
              if (s !== keyToDelete) {
                newSources[s] = state.sources[s]
              }
            })
            state.sources = newSources
            break
          }
          case "display-inline-channels": {
            state.displayInlineChannels = ev.display
            break
          }
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
      inline: InlineView,
      fullscreen: FullscreenView,
      summary: SummaryView,
    },
    configForm: {
      form: {
        defaultGain: { help: "The default gain for audio dB", hint: { type: 'numeric', validation: Z.number().gte(-40).lte(40), defaultValue: 0 } },
        channelLayout: {
          help: "Channel layout for audio output",
          hint:
          {
            type: "select",
            options: channelLayouts().map((ch) => { return { value: ch as string, display: ch as string } }),
          }
        }
      }
    }
  });
}
const channelLayouts = () => {
  const ch: ChannelLayout[] = [
    "mono", "stereo", "surround", "4.0", "5.0", "5.1", "7.1", "5.1.4", "7.1.4"
  ]
  return ch
}
function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
