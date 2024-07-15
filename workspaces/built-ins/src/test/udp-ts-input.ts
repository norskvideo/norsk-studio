import { Norsk, selectAV } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames } from "@norskvideo/norsk-studio/lib/test/_util/sinks";

import UdpTsInfo from "../input.udp-ts/info";
import { RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { UdpTsInputSettings } from "../input.udp-ts/runtime";
import { _videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";

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

  after(async () => {
    await norsk?.close();
  })

  it("Should output some frames", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });


    const av = await _videoAndAudio(norsk!, "source");
    const udp = await norsk!.output.udpTs({
      id: "av-srt",
      port: 5001,
      destinationIp: '127.0.0.1',
      interface: 'any'
    })
    udp.subscribe([{ source: av, sourceSelector: selectAV }])

    const nodes = await go(norsk, compiled);
    await Promise.all([
      await assertNodeOutputsAudioFrames(norsk, nodes, 'udp-ts'),
      await assertNodeOutputsVideoFrames(norsk, nodes, 'udp-ts')
    ])
  })
});

