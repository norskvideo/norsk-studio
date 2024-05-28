import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "norsk-studio/lib/test/_util/builder"
import * as document from 'norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from 'norsk-studio/lib/runtime/execution';
import { assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames } from "norsk-studio/lib/test/_util/sinks";
import { SrtInputSettings } from "../input.srt-caller/runtime";
import { Ffmpeg, ffmpegCommand, srtOutput } from "norsk-studio/lib/test/_util/ffmpeg";

import SrtInfo from "../input.srt-caller/info";
import { RegistrationConsts } from "norsk-studio/lib/extension/client-types";

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
              port: 5001,
              ip: '127.0.0.1',
              socketOptions: {}
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;
  let ffmpeg: Ffmpeg | undefined = undefined;

  before(async () => {
    // By spinning it up in advance, we increase the chance of getting the first keyframe..
    ffmpeg = await Ffmpeg.create(ffmpegCommand({
      transport: srtOutput({ port: 5001, mode: 'listener' })
    }));
  });

  after(async () => {
    await norsk?.close();
    await ffmpeg?.stop();
  })

  it("Should output some frames", async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const nodes = await go(norsk, compiled);
    await Promise.all([
      await assertNodeOutputsAudioFrames(norsk, nodes, 'srt'),
      await assertNodeOutputsVideoFrames(norsk, nodes, 'srt')
    ])
  })
});

