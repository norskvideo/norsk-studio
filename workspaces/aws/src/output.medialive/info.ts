import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { MediaLiveCommand, MediaLiveConfig, MediaLiveEvent, MediaLiveState } from "./runtime";
import React from "react";

export default function({ defineComponent, validation: { Z }, All }: Registration) {
  const ChannelSelection = React.lazy(async () => import('./channel-selection'));
  const InputSelection = React.lazy(async () => import('./input-selection'));
  const UrlSelection = React.lazy(async () => import('./url-selection'));
  const NodeView = React.lazy(async () => import('./node-view'));
  const InlineView = React.lazy(async () => import('./inline'));
  const FullscreenView = React.lazy(async () => import('./fullscreen'));

  return defineComponent<MediaLiveConfig, MediaLiveState, MediaLiveCommand, MediaLiveEvent>({
    identifier: 'output.medialive',
    category: 'output',
    name: "Media Live Output",
    description: "Enables the integration with AWS Elemental MediaLive, allowing users to output multiple media streams to a MediaLive channel. ",
    subscription: {
      accepts: {
        type: "multi-stream",
        media: All
      },
    },
    extraValidation: function(ctx) {
      const audioStreams = ctx.subscriptions.filter((s) => s.validatedStreams.select.includes("audio"));
      const videoStreams = ctx.subscriptions.filter((s) => s.validatedStreams.select.includes("video"));

      if (audioStreams.length == 0) {
        ctx.addWarning("Output has no audio, is this intentional")
      }

      if (videoStreams.length == 0) {
        ctx.addWarning("Output has no video, is this intentional")
      }
    },
    designtime: {
      node: NodeView
    },
    runtime: {
      initialState: () => ({
        url: undefined
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "url-located":
            return { ...state, url: ev.url };
          default:
            assertUnreachable(evType);
        }
      },
      inline: InlineView,
      fullscreen: FullscreenView,
    },
    configForm: {
      form: {
        channelId: {
          help: "The channel to output to",
          hint: {
            type: "custom",
            component: ChannelSelection,
            validation: Z.string().min(1, "Choosing a channel is mandatory")
          }
        },
        inputId: {
          help: "The input of the channel to output to",
          hint: {
            type: "custom",
            component: InputSelection,
            validation: Z.string().min(1, "Choosing an input is mandatory")
          }
        },
        destinationIndex: {
          help: "The publish URL to output to",
          hint: {
            type: "custom",
            defaultValue: 0,
            component: UrlSelection,
            validation: Z.number().min(0, "Choosing a url is mandatory")
          }
        }
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
