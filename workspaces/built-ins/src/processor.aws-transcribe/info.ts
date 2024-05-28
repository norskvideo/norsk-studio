import type Registration from "norsk-studio/lib/extension/registration";
import type { AwsTranscribeConfig } from "./runtime";
import { StreamMetadata } from "@norskvideo/norsk-sdk";
import React from "react";

export default function({
  defineComponent,
  Av,
  Subtitle,
  validation: { LanguageTagWithCountry, LanguageTagOptionalCountry, Z }
}: Registration) {
  const TranscribeLanguageSelection = React.lazy(async () => import('./transcribe-language-selection'));
  const TranslateLanguageSelection = React.lazy(async () => import('./translate-language-selection'));

  return defineComponent<AwsTranscribeConfig>({
    identifier: 'processor.aws-transcribe',
    category: 'processor',
    name: "AWS Transcribe",
    subscription: {
      // Must have video AND audio?
      // Or is video optional?
      // either way, we only want one of each
      // and we want QUCV to respect our choice
      accepts: {
        type: 'single-stream',
        media: Av // video because we'll use the id of it..
      },
      produces: {
        type: "fixed-list",
        possibleMedia: Subtitle,
        keys: (cfg) => [{
          key: "subs",
          display: "Subtitle",
          media: Subtitle
        }].concat(cfg.targetLanguage ?
          [{
            key: "subs-translated",
            display: "Translated Subtitle",
            media: Subtitle
          }] : []),
        selector: (selection: string[], metadata: StreamMetadata[]) =>
          metadata.filter((x) => selection.includes(x.streamKey.renditionName)).map(x => x.streamKey)
      }
    },
    extraValidation: function(ctx) {
      const video = ctx.videoInputs();
      const audio = ctx.audioInputs();
      if (video.length !== 1) {
        ctx.addError("AWS Transcribe requires a single video stream to use as a reference")
      }
      if (audio.length !== 1) {
        ctx.addError("AWS Transcribe requires a single audio stream to transcribe")
      }
    },
    display: (_desc) => {
      const result: { [k: string]: string } = {};
      return result;
    },
    configForm: {
      form: {
        language: { help: "Source language to transcribe", hint: { type: 'custom', component: TranscribeLanguageSelection, defaultValue: "en-US", validation: LanguageTagWithCountry } },
        targetLanguage: { help: "Target language to translate to (optional).", hint: { type: 'custom', component: TranslateLanguageSelection, defaultValue: "", validation: Z.union([LanguageTagOptionalCountry, Z.string().length(0)]) } }
      }
    }
  });
}
