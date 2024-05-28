import { AudioTranscribeWhisperNode, Norsk, StreamKeyOverrideNode, StreamMetadataOverrideNode, SubscribeDestination, SubscriptionError, selectSubtitles } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, OnCreated, RelatedMediaNodes, ServerComponentDefinition, StudioNodeSubscriptionSource } from 'norsk-studio/lib/extension/runtime-types';
import { debuglog } from 'norsk-studio/lib/server/logging';

export type WhisperTranscribeConfig = {
  id: string,
  displayName: string,
  model: string,
  translate: boolean,
  language: string,
}

export default class WhisperTranscribeDefinition implements ServerComponentDefinition<WhisperTranscribeConfig, WhisperTranscribeNode> {
  async create(norsk: Norsk, cfg: WhisperTranscribeConfig, cb: OnCreated<WhisperTranscribeNode>) {
    const node = new WhisperTranscribeNode(norsk, cfg);
    await node.initialised;
    cb(node);
  }
}


class WhisperTranscribeNode
  implements CreatedMediaNode,
  SubscribeDestination {
  norsk: Norsk;
  cfg: WhisperTranscribeConfig;
  initialised: Promise<void>;
  whisper?: AudioTranscribeWhisperNode;
  whisperCreating: boolean = false;

  streamkey?: StreamKeyOverrideNode;
  source?: StudioNodeSubscriptionSource;
  output?: StreamMetadataOverrideNode;

  constructor(norsk: Norsk, cfg: WhisperTranscribeConfig) {
    this.norsk = norsk;
    this.cfg = cfg;
    this.initialised = this.initialise();
  }

  get id() { return this.cfg.id; }

  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();


  async initialise() {
    this.output = await this.norsk.processor.transform.streamMetadataOverride({ id: `${this.id}-output` });
    this.relatedMediaNodes.addOutput(this.output);
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    if (sources.length < 1) return;
    sources.forEach((s) => s.registerForContextChange(this))
    this.source = sources[0];
  }

  async sourceContextChange(_responseCallback: (error?: SubscriptionError | undefined) => void): Promise<boolean> {
    if (this.whisper || this.whisperCreating) return false;
    if (!this.source) { return false; }
    if (!this.source.source.relatedMediaNodes.output) { return false; }

    const video = this.source?.latestStreams().find((s) => {
      return s.metadata.message.case == 'video';
    })
    if (video) {
      debuglog("Creating whisper 1: " + (this.whisper != null));
      this.whisperCreating = true; // not sure why I need this but this seems to be running twice during the async call
      this.whisper = await this.norsk.processor.transform.audioTranscribeWhisper({
        id: `${this.id}-whisper`,
        outputStreamId: 540,
        model: this.cfg.model,
        language: this.cfg.language,
        useGpu: true,
      })
      this.relatedMediaNodes.addInput(this.whisper);
      debuglog("CreateD whisper 2", this.whisper);
      this.whisper.subscribe(this.source.selectAudio(), undefined)

      this.streamkey = await this.norsk.processor.transform.streamKeyOverride({
        streamKey: { ...video.metadata.streamKey, renditionName: 'subs' }
      })
      this.streamkey.subscribe([{
        source: this.whisper,
        sourceSelector: selectSubtitles
      }])
      this.output?.subscribe([{
        source: this.streamkey,
        sourceSelector: selectSubtitles
      }])

      return false;
    }
    else {
      return false;
    }
  }
}





