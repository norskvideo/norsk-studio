import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { AudioEncoderConfig } from "./runtime";
import { discriminatedForm } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SampleRate } from "@norskvideo/norsk-sdk";
import React from "react";

export default function({
  defineComponent,
  Audio,
  validation: { Z },
}: Registration) {
  // Include commas between thousands places
  const format = (stat: number) =>
    Math.floor(stat).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const Hz = (v: SampleRate) => ({ display: `${format(v)}Hz`, value: v });
  return defineComponent<AudioEncoderConfig>({
    identifier: 'processor.audioEncoder',
    category: 'processor',
    name: "Audio Encoder",
    description: "Explicit audio encode.",
    subscription: {
      accepts: {
        type: 'single-stream',
        media: Audio
      },
      produces: {
        type: 'single-stream',
        media: Audio
      },
    },
    display: ({ config }) => {
      const displayed: Record<string, string> = {
        kind: config.codec.kind,
        bitrate: format(config.bitrate) + " bps",
      };
      if (typeof config.channelLayout === 'string') {
        displayed.channelLayout = config.channelLayout;
      } else displayed.channelLayout = "custom";
      if (config.codec.kind === 'aac') {
        displayed.profile = config.codec.profile;
        displayed.sampleRate = format(config.codec.sampleRate) + " Hz";
      } else if (config.codec.kind === 'opus') {
        // No config
      }
      return displayed;
    },
    extraValidation: (ctx) => {
      ctx.requireAudio(1);
    },
    configForm: {
      form: {
        renditionName: {
          help: "Name of this rendition of encoded audio",
          hint: {
            type: 'text',
          },
        },
        channelLayout: {
          help: "Channel layout",
          hint: {
            type: 'select',
            defaultValue: "stereo",
            options: [
              { display: "Mono", value: "mono" },
              { display: "Stereo", value: "stereo" },
              { display: "Surround", value: "surround" },
              { display: "4.0", value: "4.0" },
              { display: "5.0", value: "5.0" },
              { display: "5.1", value: "5.1" },
              { display: "7.1", value: "7.1" },
            ],
          },
        },
        bitrate: {
          help: "Bitrate (bits per second)",
          hint: {
            type: 'numeric',
            validation: Z.number().int().min(4_000, "Bitrate needs to be in bits per second not kilobits per second"),
            defaultValue: 96_000,
            step: 1_000,
          },
        },
        codec: {
          help: "Codec settings for AAC or Opus",
          hint: {
            type: 'form-pick',
            form: discriminatedForm.kind({
              aac: {
                display: "AAC",
                form: {
                  sampleRate: {
                    help: "Sample rate (Hz)",
                    hint: {
                      type: 'select',
                      options: [
                        Hz(8000),
                        Hz(11025),
                        Hz(12000),
                        Hz(16000),
                        Hz(22050),
                        Hz(24000),
                        Hz(32000),
                        Hz(44100),
                        Hz(48000),
                        Hz(64000),
                        Hz(88200),
                        Hz(96000),
                      ],
                      defaultValue: 48000,
                    },
                  },
                  profile: {
                    help: "AAC profile",
                    hint: {
                      type: 'select',
                      defaultValue: 'main',
                      options: [
                        { value: 'main', display: "Main Profile" },
                        { value: 'lc', display: "Low Complexity Profile" },
                        { value: 'high', display: "High Efficiency Profile" }, // High Efficiency? SSR?
                      ],
                    },
                  },
                },
              },
              opus: {
                display: "Opus",
                form: {
                },
              },
            }),
            view: React.lazy(async () => import('./form-views')),
          },
        },
        notes: { help: "Notes about this component", hint: { type: 'text', optional: true } },
      }
    }
  });
}
