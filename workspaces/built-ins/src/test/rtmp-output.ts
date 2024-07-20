import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { RtmpOutputEvent, RtmpOutputSettings, RtmpOutputState } from "../output.rtmp/runtime";
import { testSourceDescription, video, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import RtmpInfo from "../output.rtmp/info";
import RtmpInputInfo from "../input.rtmp/info";
import { Av, BaseConfig, NodeInfo, RegistrationConsts, Video } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleInputWrapper, SimpleSinkWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { TraceSink } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { expect } from "chai";
import { RtmpInputEvent, RtmpInputSettings, RtmpInputState } from "../input.rtmp/runtime";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

// All we're really testing here
// is that we're spinning up the rtmp node
// with some valid config and that we haven't made a huge snafu in doing so
describe("RTMP Output", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<RtmpOutputSettings, RtmpOutputState, object, RtmpOutputEvent>
          ('rtmp',
            RtmpInfo(RegistrationConsts),
            { url: "rtmp://127.0.0.1:65403/norsk/output" }
          ).reify())
      .addNode(
        new YamlNodeBuilder<RtmpInputSettings, RtmpInputState, object, RtmpInputEvent>
          ('input',
            RtmpInputInfo(RegistrationConsts),
            {
              appName: 'norsk',
              port: 65403,
              streamNames: ['output']
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;

  afterEach(async () => {
    await norsk?.close();
  })

  it("Provides an RTMP output when there is a stream", async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled);
    const rtmp = result.components["rtmp"] as SimpleSinkWrapper;
    const input = result.components["input"] as SimpleInputWrapper;
    const source = await videoAndAudio(norsk, 'source');
    rtmp.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-first-stream", select: Av }
    )], { requireOneOfEverything: true })

    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;
    sink.subscribe([
      new StudioNodeSubscriptionSource(input, compiled.components['input'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, RtmpInputInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
    ])
    await waitForCondition(() => sink.streamCount() == 2)
    expect(sink.streamCount()).equal(2);
  })

  it("Provides an RTMP output when the stream changes", async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled);
    const source = await video(norsk, 'source1');
    const input = result.components["input"] as SimpleInputWrapper;
    const rtmp = result.components["rtmp"] as SimpleSinkWrapper;
    rtmp.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-first-stream", select: Video }
    )], { requireOneOfEverything: true })

    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;
    sink.subscribe([
      new StudioNodeSubscriptionSource(input,
        compiled.components['input'].yaml,
        { type: 'take-all-streams', select: ["audio", "video"] }, RtmpInputInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
    ], { requireOneOfEverything: false })

    await waitForCondition(() => sink.streamCount() == 1)
    await source.close();
    await waitForCondition(() => sink.streamCount() == 0, 60000, 10)

    const source2 = await videoAndAudio(norsk, 'source2');
    rtmp.subscribe([new StudioNodeSubscriptionSource(
      source2,
      testSourceDescription(),
      { type: "take-first-stream", select: Av }
    )])
    await waitForCondition(() => sink.streamCount() == 2, 60000, 10)
    expect(sink.streamCount()).equal(2);
  })
});

