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
import { Av, RegistrationConsts, Video } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleSinkWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { FfprobeStream, getStreams } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { expect } from "chai";

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
            { url: "rtmp://127.0.0.1:5001/norsk/output" }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;
  let ffprobe: Promise<FfprobeStream[]> = undefined!;

  afterEach(async () => {
    await norsk?.close();
  })

  it("Provides an RTMP output when there is a stream", async () => {
    ffprobe = getStreams('rtmp://127.0.0.1:5001/norsk/output');
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled);
    const rtmp = result.components["rtmp"] as SimpleSinkWrapper;
    const source = await videoAndAudio(norsk, 'source');
    rtmp.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-first-stream", select: Av }
    )], { requireOneOfEverything: true })
    const streams = await ffprobe;
    expect(streams ?? []).lengthOf(2);
  })

  it("Provides an RTMP output when the stream changes", async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled);
    const source = await video(norsk, 'source1');
    const rtmp = result.components["rtmp"] as SimpleSinkWrapper;
    rtmp.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-first-stream", select: Video }
    )], { requireOneOfEverything: true })

    ffprobe = getStreams('rtmp://127.0.0.1:5001/norsk/output');
    const streams1 = await ffprobe;
    expect(streams1 ?? []).lengthOf(1);
    const source2 = await videoAndAudio(norsk, 'source2');
    rtmp.subscribe([new StudioNodeSubscriptionSource(
      source2,
      testSourceDescription(),
      { type: "take-first-stream", select: Av }
    )], { requireOneOfEverything: true })
    ffprobe = getStreams('rtmp://127.0.0.1:5001/norsk/output');
    const streams2 = await ffprobe;
    expect(streams2 ?? []).lengthOf(2);

  })
});

