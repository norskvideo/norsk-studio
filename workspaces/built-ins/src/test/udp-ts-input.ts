import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "norsk-studio/lib/test/_util/builder"
import * as document from 'norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from 'norsk-studio/lib/runtime/execution';
import { assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames } from "norsk-studio/lib/test/_util/sinks";
import { Ffmpeg, ffmpegCommand, udpOut } from "norsk-studio/lib/test/_util/ffmpeg";

import UdpTsInfo from "../input.udp-ts/info";
import { RegistrationConsts } from "norsk-studio/lib/extension/client-types";
import { UdpTsInputSettings } from "../input.udp-ts/runtime";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("UDP TS Input", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<UdpTsInputSettings>
          ('udp-ts',
            UdpTsInfo(RegistrationConsts),
            {
              sourceName: 'foo',
              port: 5001,
              ip: '127.0.0.1'
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
      transport: udpOut({ port: 5001 })
    }));
  });

  after(async () => {
    await norsk?.close();
    await ffmpeg?.stop();
  })

  it("Should output some frames", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const nodes = await go(norsk, compiled);
    await Promise.all([
      await assertNodeOutputsAudioFrames(norsk, nodes, 'udp-ts'),
      await assertNodeOutputsVideoFrames(norsk, nodes, 'udp-ts')
    ])
  })
});

