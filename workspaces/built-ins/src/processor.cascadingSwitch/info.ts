import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { CascadingSwitchCommand, CascadingSwitchConfig, CascadingSwitchEvent, CascadingSwitchState } from "./runtime";

export default function({
  defineComponent,
  Av,
  React,
  common: { Resolutions, FrameRates },
}: Registration) {

  const SourceSelection = React.lazy(async () => import('./source-selection'));
  const InlineView = React.lazy(async () => import('./inline-view'));

  return defineComponent<CascadingSwitchConfig, CascadingSwitchState, CascadingSwitchCommand, CascadingSwitchEvent>({
    identifier: 'processor.cascadingSwitch',
    category: 'processor',
    name: "Cascading Switch",
    description: "This component manages multiple A/V (audio and video) sources based on priority, allowing for the configuration of settings such as resolution, frame rate, sample rate, and channel layout.",
    subscription: {
      // This needs to change anyway
      // but it'll be the same as MCS
      accepts: {
        type: 'multi-stream',
        media: Av
      },
      produces: {
        type: "single-stream",
        media: Av
      }
    },
    extraValidation: function(ctx) {
      // For now, each subscription has to have audio and video to work
      ctx.subscriptions.forEach((s) => {
        if (!s.validatedStreams.select.includes("video")) {
          ctx.addError(`Subscription to ${s.source} is missing video`)
        }
        if (!s.validatedStreams.select.includes("audio")) {
          ctx.addError(`Subscription to ${s.source} is missing audio`)
        }

        if (s.streams.type == 'take-all-streams') {
          ctx.addError(`Subscription to ${s.source} could have multiple streams, this node only accepts a single stream from each source`)
        }
        if (s.streams.type == 'take-specific-streams' && s.streams.filter.length > 1) {
          ctx.addError(`Subscription to ${s.source} could have multiple streams, this node only accepts a single stream from each source`)
        }
      })
    },
    display: (desc) => {
      return {
        resolution: desc.config.resolution.width.toString() + "x" + desc.config.resolution.height.toString(),
        frameRate: desc.config.frameRate.frames.toString() + "/" + desc.config.frameRate.seconds.toString(),
        sources: desc.config.sources.join(",")
      }
    },
    css: ["extra.css"],
    designtime: {
      uiEvents: {
        onSubscriptionAdded: function(this, sub) {
          if (sub.source) {
            this.config.sources.push(sub.source);
          }
        },
        onSubscriptionRemoved: function(this, sub) {
          this.config.sources = this.config.sources.filter((s: string) => s != sub.source);
        },
        onGlobalNodeUpdated: function(this, node, id: string) {
          if (node.id != id) {
            this.config.sources = this.config.sources.map((s: string) => s == id ? node.id : s);
          }
        },
        onGlobalNodeRemoved: function(this, _node, id: string) {
          this.config.sources = this.config.sources.filter((s: string) => s != id);
        },
      }
    },
    runtime: {
      initialState: () => ({
        activeSource: '',
        availableSources: []
      }),
      handleEvent: (ev, state): CascadingSwitchState => {
        const evType = ev.type;
        switch (evType) {
          case 'active-source-changed':
            return { ...state, activeSource: ev.activeSource };
          case 'source-online':
            state.availableSources.push(ev.source);
            return { ...state };
          case 'source-offline':
            state.availableSources.splice(state.availableSources.indexOf(ev.source), 1);
            return { ...state };
          default:
            assertUnreachable(evType);
        }
      },
      inline: InlineView,
      summary: InlineView,
      fullscreen: InlineView
    },
    configForm: {
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
        sources: {
          help: "The priority order in which the sources will be chosen when available",
          hint: {
            type: 'custom',
            component: SourceSelection,
            defaultValue: []
          }
        },
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
      },
    },
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
