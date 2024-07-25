import { AudioTranscribeAwsNode, Norsk, StreamKeyOverrideNode, StreamMetadataOverrideNode, SubscribeDestination, SubscriptionError, selectSubtitles, AudioTranscribeAwsSettings as SdkSettings, SubtitleTranslateAwsSettings as TranslateSdkSettings, SubtitleTranslateAwsNode } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, OnCreated, RelatedMediaNodes, ServerComponentDefinition, StudioNodeSubscriptionSource } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import express from 'express';
import { ListLanguagesCommand, TranslateClient } from '@aws-sdk/client-translate';
import { warninglog } from '@norskvideo/norsk-studio/lib/server/logging';

export type AwsTranscribeConfig = Pick<SdkSettings, 'language'> & Pick<TranslateSdkSettings, 'targetLanguage'> & {
  id: string,
  displayName: string,
}

export type LanguageInfo = { name: string, code: string };
export type LanguagesResult = { translate: LanguageInfo[], transcribe: LanguageInfo[] }

export default class AwsTranscribeDefinition implements ServerComponentDefinition<AwsTranscribeConfig, AwsTranscribeNode> {
  async create(norsk: Norsk, cfg: AwsTranscribeConfig, cb: OnCreated<AwsTranscribeNode>) {
    const node = new AwsTranscribeNode(norsk, cfg);
    await node.initialised;
    cb(node);
  }

  routes() {
    const router = express.Router()
    router.get("/languages", async (_req, res) => {
      const transcribe: LanguageInfo[] = [
        { name: "Chinese, Simplified", code: "zh-CN" },
        { name: "English, Australian", code: "en-AU" },
        { name: "English, British", code: "en-GB" },
        { name: "English, US", code: "en-US" },
        { name: "French", code: "fr-FR" },
        { name: "French, Canadian", code: "fr-CA" },
        { name: "German", code: "de-DE" },
        { name: "Hindi, Indian", code: "hi-IN" },
        { name: "Italian", code: "it-IT" },
        { name: "Japanese", code: "ja-JP" },
        { name: "Korean", code: "ko-KR" },
        { name: "Portuguese, Brazilian", code: "pt-BR" },
        { name: "Spanish, US", code: "es-US" },
        { name: "Thai", code: "th-TH" },
      ];
      let translate: LanguageInfo[] = [
        { name: "English", code: "en" },
        { name: "Chinese (Simplified)", code: "zh" },
        { name: "French", code: "fr" },
        { name: "German", code: "de" },
        { name: "Hindi", code: "hi" },
        { name: "Spanish", code: "es" },
        { name: "Japanese", code: "ja" }
      ];

      try {
        const client = new TranslateClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
        const res = await client.send(new ListLanguagesCommand());
        if (res.Languages) {
          translate = res.Languages?.map((l) => ({ name: l.LanguageName || "Unknown", code: l.LanguageCode || "unk" }));
        }
      } catch (e) {
        warninglog("Error fetching AWS translate languages, proceeding with builtin", e);
      }

      res.send(JSON.stringify({ transcribe, translate }));
    })
    return router;
  }
}

class AwsTranscribeNode
  implements CreatedMediaNode,
  SubscribeDestination {
  norsk: Norsk;
  cfg: AwsTranscribeConfig;
  initialised: Promise<void>;
  aws?: AudioTranscribeAwsNode;
  translate?: SubtitleTranslateAwsNode;

  streamkey?: StreamKeyOverrideNode;
  translatedStreamkey?: StreamKeyOverrideNode;

  originalOverride?: StreamMetadataOverrideNode;
  translatedOverride?: StreamMetadataOverrideNode;

  source?: StudioNodeSubscriptionSource;
  output?: StreamMetadataOverrideNode;

  constructor(norsk: Norsk, cfg: AwsTranscribeConfig) {
    this.norsk = norsk;
    this.cfg = cfg;
    this.initialised = this.initialise();
  }

  get id() { return this.cfg.id; }

  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  async initialise() {
    // This isn't needed any more
    this.output = await this.norsk.processor.transform.streamMetadataOverride({ id: `${this.id}-output` });
    this.relatedMediaNodes.addOutput(this.output);
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    if (sources.length < 1) return;
    this.source = sources[0];
    this.source.registerForContextChange(this);
  }

  async sourceContextChange(_responseCallback: (error?: SubscriptionError | undefined) => void): Promise<boolean> {
    if (this.aws) return false;
    if (!this.source) { return false; }

    const video = this.source?.latestStreams().find((s) => {
      return s.metadata.message.case == 'video';
    })

    if (video) {
      this.aws = await this.norsk.processor.transform.audioTranscribeAws({
        id: `${this.id}-aws`,
        awsRegion: process.env.AWS_REGION ?? 'eu-west-2',
        outputStreamId: 540,
        language: this.cfg.language,
        sentenceBuildMode: 'stable',
        sentenceStabilizationMode: 'medium'
      })
      this.relatedMediaNodes.addInput(this.aws);
      this.aws.subscribe(this.source.selectAudio(), undefined)

      this.streamkey = await this.norsk.processor.transform.streamKeyOverride({
        streamKey: { ...video.metadata.streamKey, renditionName: 'subs' }
      })
      this.streamkey.subscribe([{
        source: this.aws,
        sourceSelector: selectSubtitles
      }])
      this.originalOverride = await this.norsk.processor.transform.streamMetadataOverride({
        subtitles: {
          default: true
        }
      })
      this.originalOverride?.subscribe([{ source: this.streamkey, sourceSelector: selectSubtitles }])


      if (this.cfg.targetLanguage) {
        this.translate = await this.norsk.processor.transform.subtitleTranslateAws({
          id: `${this.id}-aws-translate`,
          targetLanguage: this.cfg.targetLanguage,
          // could set source from our source config but that will appear anyway in metadata
          // though doesn't seem to be working so lets set it
          sourceLanguage: this.cfg.language
        })
        this.translate.subscribe([{
          source: this.aws,
          sourceSelector: selectSubtitles
        }])

        this.translatedStreamkey = await this.norsk.processor.transform.streamKeyOverride({
          streamKey: { ...video.metadata.streamKey, renditionName: 'subs-translated' } // this could be the language which is what the underlying processor does except for the streamid part
        })
        this.translatedStreamkey.subscribe([{
          source: this.translate,
          sourceSelector: selectSubtitles
        }])

        this.translatedOverride = await this.norsk.processor.transform.streamMetadataOverride({
          subtitles: {
            default: false
          }
        })
        this.translatedOverride.subscribe([
          {
            source: this.translatedStreamkey,
            sourceSelector: selectSubtitles
          }
        ])
      }

      this.output?.subscribe([{
        source: this.originalOverride,
        sourceSelector: selectSubtitles
      }].concat(this.translatedOverride ? [{ source: this.translatedOverride, sourceSelector: selectSubtitles }] : [])
      )

      return false;
    }
    else {
      return false;
    }
  }
}





