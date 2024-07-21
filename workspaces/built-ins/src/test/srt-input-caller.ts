import { Norsk, SourceMediaNode, SrtOutputNode, StreamMetadataOverrideNode, selectAV } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { TraceSink, assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { SrtInputSettings } from "../input.srt-caller/runtime";

import SrtInfo from "../input.srt-caller/info";
import { BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";
import { _videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("SRT Caller Input", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<SrtInputSettings>
          ('srt',
            SrtInfo(RegistrationConsts),
            {
              sourceName: 'foo',
              port: 65403,
              ip: '127.0.0.1',
              socketOptions: {}
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;
  let srt: SrtOutputNode | undefined = undefined;
  let av: StreamMetadataOverrideNode | undefined = undefined;

  before(async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    av = await _videoAndAudio(norsk!, "source");
    srt = await norsk!.output.srt({
      id: "av-srt-output",
      mode: "listener",
      ip: "0.0.0.0",
      port: 65403
    })
    srt.subscribe([{ source: av, sourceSelector: selectAV }])
  });

  after(async () => {
    await norsk?.close();
    await new Promise(f => setTimeout(f, 1000));
  })

  it("Should output some frames", async () => {
    const compiled = await testDocument();
    const nodes = await go(norsk!, compiled);

    await Promise.all([
      await assertNodeOutputsAudioFrames(norsk!, nodes, 'srt'),
      await assertNodeOutputsVideoFrames(norsk!, nodes, 'srt')
    ])
  })
});

describe("SRT Caller Reconnect", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<SrtInputSettings>
          ('srt',
            SrtInfo(RegistrationConsts),
            {
              sourceName: 'foo',
              port: 65403,
              ip: '127.0.0.1',
              socketOptions: {}
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;
  let srt: SrtOutputNode | undefined = undefined;
  let av: SourceMediaNode | undefined = undefined;

  before(async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    av = await _videoAndAudio(norsk!, "source");
    srt = await norsk!.output.srt({
      id: "av-srt-output",
      mode: "listener",
      ip: "0.0.0.0",
      port: 65403
    })
    srt.subscribe([{ source: av, sourceSelector: selectAV }])
  });

  after(async () => {
    await norsk?.close();
    await new Promise(f => setTimeout(f, 1000));
  })

  it("Should output some frames", async () => {
    const compiled = await testDocument();
    const nodes = await go(norsk!, compiled);
    const source = nodes.components['srt'];
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    sink.subscribe([
      new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml,
        { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
    ])

    await waitForCondition(() => sink.streamCount() == 2 && sink.totalMessages() > 25, 10000.0);
    await srt?.close();
    await waitForCondition(() => sink.streamCount() == 0, 10000.0);

    srt = await norsk!.output.srt({
      id: "av-srt-output",
      mode: "listener",
      ip: "0.0.0.0",
      port: 65403
    })
    srt.subscribe([{ source: av!, sourceSelector: selectAV }])

    await Promise.all([
      await waitForAssert(() => sink.streamCount() == 2, () => sink.streamCount() == 2, 10000, 500),
      await assertNodeOutputsAudioFrames(norsk!, nodes, 'srt'),
      await assertNodeOutputsVideoFrames(norsk!, nodes, 'srt')
    ])
  })
});

