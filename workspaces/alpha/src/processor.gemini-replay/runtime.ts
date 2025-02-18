import { ComposePart, FunctionCallMetadata, FunctionDeclaration, GeminiServerContent, MediaStoreRecorderNode, Norsk, StreamKeyOverrideNode, SubscribeDestination, SubscriptionError, VideoComposeDefaults, VideoComposeNode, VideoComposeSettings, selectAudio, selectVideo, videoToPin } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, OnCreated, RelatedMediaNodes, ServerComponentDefinition, StudioNodeSubscriptionSource } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { env } from "process";

export type GeminiReplayConfig = {
  id: string,
  displayName: string,
  systemInstruction: string;
  preRollMs: number;
  durationMs: number;
  ignoreWindowMs: number;
  // frameRate: FrameRate;
  // videoResolution: Resolution;
  notes?: string;
}

export default class GeminiReplayDefinition implements ServerComponentDefinition<GeminiReplayConfig, GeminiReplayNode> {
  async create(norsk: Norsk, cfg: GeminiReplayConfig, cb: OnCreated<GeminiReplayNode>) {
    const node = new GeminiReplayNode(norsk, cfg);
    await node.initialised;
    cb(node);
  }
}

class GeminiReplayNode
  implements CreatedMediaNode,
  SubscribeDestination {
  norsk: Norsk;
  cfg: GeminiReplayConfig;
  initialised: Promise<void>;
  logger: GeminiLogger = new GeminiLogger();

  videoPidNormalizer?: StreamKeyOverrideNode;
  audioPidNormalizer?: StreamKeyOverrideNode;
  replayStore?: MediaStoreRecorderNode;
  compose?: VideoComposeNode<"primary" | "pip">;

  t0: Date;
  tDetectionStarted?: Date;

  primary: ComposePart<"primary">;
  pip: ComposePart<"pip">;
  lastAction: number = -1;

  constructor(norsk: Norsk, cfg: GeminiReplayConfig) {
    this.norsk = norsk;
    this.cfg = cfg;
    this.initialised = this.initialise();

    this.primary = {
      pin: "primary",
      opacity: 1.0,
      zIndex: 0,
      compose: VideoComposeDefaults.fullscreen()
    };

    this.pip = {
      pin: "pip",
      opacity: 1.0,
      zIndex: 1,
      compose: VideoComposeDefaults.percentage({
        sourceRect: { x: 0, y: 0, width: 100, height: 100 },
        destRect: { x: 5, y: 5, width: 45, height: 45 },
      })
    };

    this.t0 = new Date();
    this.tDetectionStarted = new Date(new Date().getTime() + 6000);
  }

  get id() { return this.cfg.id; }

  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  async actionDetected(callMetadata: FunctionCallMetadata, _geminiActionS: number) {
    if (this.tDetectionStarted === undefined) {
      this.logger.logNonContent("Action reported but no detectionStarted event");
      return;
    }

    if (callMetadata.frameUtc === undefined) {
      this.logger.logNonContent("Action reported no frame timestamp");
      return;
    }

    try {
      const metadata = await this.replayStore!.metadata();
      const lastSession = metadata[metadata.length - 1];
      const videoStream = lastSession.streams.filter((stream) => stream.streamKey.streamId == videoStreamKey.streamId)[0];
      const lastVersion = videoStream.versions[videoStream.versions.length - 1];

      const versionStartTimeMs = lastVersion.startDateTime.getTime();

      const elapsed = callMetadata.frameUtc.getTime() - versionStartTimeMs;

      if (elapsed < this.lastAction + this.cfg.ignoreWindowMs) {
        this.logger.logNonContent(`Ignoring action since only just replayed`);
        return;
      }

      this.lastAction = elapsed;
      
      const preRoll2 = Math.min(this.cfg.preRollMs, lastVersion.durationMs);
      const cutStart = versionStartTimeMs + elapsed - preRoll2;

      this.logger.logNonContent(`Cut start at ${new Date(cutStart)}`);

      const cut = this.replayStore!.cutListEntry({
        durationMs: this.cfg.durationMs,
        startDateTime: new Date(cutStart),
        streamSelection: [
          [videoStreamKey, replayVideoStreamKey]
        ],
        trimPartialGops: true
      });

      const _ = await this.norsk.mediaStore.player({
        id: `cut-reader-${elapsed}`,
        cuts: [cut],
        sourceName: `gemini-cut`,
        onCreate: (node) => {
          this.compose!.subscribeToPins([{ source: this.videoPidNormalizer!, sourceSelector: videoToPin(this.primary.pin) },
          { source: node, sourceSelector: videoToPin(this.pip.pin) }]);
        },
        onClose: () => {
          this.compose!.subscribeToPins([{ source: this.videoPidNormalizer!, sourceSelector: videoToPin(this.primary.pin) }]);
        }
      });
    }
    catch (err) {
      console.log("Replay failed:", err);

    }
    return;
  }

  async initialise() {
    const functions: FunctionDeclaration[] = [
      {
        name: "action_detected",
        description: "Call this function when action is detected, as detailed in the system instruction",
        parameters: [
          {
            name: "seconds",
            description: "The current time into the video, in seconds",
            type: "number",
          },
        ],
        response: undefined,
        function: this.actionDetected.bind(this)
      },
    ];

    this.norsk = await Norsk.connect();

    const gemini = await this.norsk.processor.control.geminiProcessor({
      googleApiKey: env.GOOGLE_API_KEY!,
      model: "gemini-2.0-flash-exp",
      systemInstruction: this.cfg.systemInstruction,
      functions,
      infoCb: (info) => console.log(`Info: ${info}`),
      contentCb: this.logger.logContent.bind(this.logger),
      videoSettings: {
        frameRate: { frames: 10, seconds: 5 }, // this.settings.frameRate,
        resolution: { width: 360, height: 280 },// this.cfg.videoResolution,
        videoApi: {
          apiType: "singleShot",
          historicalContextMs: 5000,
          prompt: "In this request, I am sending you an image plus context that you gave from about previous images.  Using this information, perform what is requested in the systemInstruction and also return a text-based description of the action in image that I can send back to you on future images."
        }
      },
    });

    this.videoPidNormalizer = await this.norsk.processor.transform.streamKeyOverride({ id: "video_key", streamKey: videoStreamKey });

    this.audioPidNormalizer = await this.norsk.processor.transform.streamKeyOverride({ id: "audio_key", streamKey: audioStreamKey });

    const abrLadder = await this.norsk.processor.transform.videoEncode({
      id: "ladder",
      rungs: [
        {
          name: "video",
          width: 1280,
          height: 720,
          frameRate: { frames: 25, seconds: 1 },
          codec: {
            type: "x264",
            bitrateMode: { value: 2_000, mode: "abr" },
            keyFrameIntervalMax: 25,
            keyFrameIntervalMin: 25,
            sceneCut: 0,
            bframes: 0,
            preset: "fast",
            tune: "zerolatency"
          }
        }
      ],
    });

    this.replayStore = await this.norsk.mediaStore.recorder({
      name: "gemini-replay",
      path: "/tmp/gemini-replay",
      chunkFileDurationSeconds: 3600,
      expiry: { expire: "bySize", size: BigInt(1_500_000_000) },
    });

    const composeSettings: VideoComposeSettings<"primary" | "pip"> = {
      id: "compose",
      referenceStream: this.primary.pin,
      outputResolution: { width: 1280, height: 720 },
      parts: [this.primary, this.pip],
      outputPixelFormat: "rgba",
      onError: () => process.exit(), // interval keeps this script alive after nodes close
    };

    this.compose = await this.norsk.processor.transform.videoCompose(composeSettings);

    const delayed = await this.norsk.processor.transform.jitterBuffer({ delayMs: 0, });

    this.compose.subscribeToPins([{ source: this.videoPidNormalizer, sourceSelector: videoToPin(this.primary.pin) }]);

    abrLadder.subscribe([{ source: this.compose, sourceSelector: selectVideo }]);

    this.replayStore.subscribe([{ source: this.audioPidNormalizer, sourceSelector: selectAudio },
    { source: abrLadder, sourceSelector: selectVideo },]);

    gemini.subscribe([{ source: this.audioPidNormalizer, sourceSelector: selectAudio },
    { source: this.videoPidNormalizer, sourceSelector: selectVideo }]);

    delayed.subscribe([{ source: abrLadder, sourceSelector: selectVideo },
    { source: this.audioPidNormalizer, sourceSelector: selectAudio }]);

    // output.subscribe([{ source: delayed, sourceSelector: selectAV}], gateThenShutdown(2));
    // this.output = await this.norsk.processor.transform.streamMetadataOverride({ id: `${this.id}-output` });
    this.relatedMediaNodes.addOutput(delayed);
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    if (sources.length < 1) return;
    this.videoPidNormalizer?.subscribe(sources.flatMap((s) => s.selectVideo()))
    this.audioPidNormalizer?.subscribe(sources.flatMap((s) => s.selectAudio()))
  }

  public async sourceContextChange(_responseCallback: (error?: SubscriptionError) => void): Promise<boolean> {
    return false;
  }
}

const videoStreamKey = {
  programNumber: 1,
  renditionName: "video",
  streamId: 256,
  sourceName: "input",
};

const audioStreamKey = {
  programNumber: 1,
  renditionName: "audio",
  streamId: 257,
  sourceName: "input",
};

const replayVideoStreamKey = {
  programNumber: 2,
  renditionName: "video",
  streamId: 256,
  sourceName: "input",
};



export class GeminiLogger {
  t0: Date;
  inTurn: boolean;

  constructor() {
    this.inTurn = false;
    this.t0 = new Date();
  }

  logNonContent(message: string) {
    if (this.inTurn) {
      process.stdout.write("\n");
    }
    console.log(`${(new Date()).getTime() - this.t0.getTime()}: ${message}`);
  }
  
  logContent(content: GeminiServerContent) {
    if (content.parts.length > 0) {
      if (!this.inTurn) {
        process.stdout.write(`${(new Date()).getTime() - this.t0.getTime()}: `);
      }
      this.inTurn = true;
    }
    content.parts.forEach((part) => {
      const partType = part.partType;
      switch (partType) {
        case "text":
          if (!part.value.startsWith("```")) {
            process.stdout.write(part.value);
          }
          break;
        case "blob":
          process.stdout.write("[blob]");
          break;
        default:
          exhaustiveCheck(partType);
      }
    });
    if (content.turnComplete && this.inTurn) {
      process.stdout.write("\n");
      this.inTurn = false;
    }
  }
}

export function exhaustiveCheck(a: never): never {
  throw new Error(`Unhandled case: ${a}`);
}

