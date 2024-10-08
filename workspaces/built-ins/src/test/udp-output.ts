import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { UdpTsOutputSettings } from "../output.udpTs/runtime";
import { testSourceDescription, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import { waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import UdpInfo from "../output.udpTs/info";
import { Av, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleSinkWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

// All we're really testing here
// is that we're spinning up the udp node
// with some valid config and that we haven't made a huge snafu in doing so
describe("TS UDP Output", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<UdpTsOutputSettings>
          ('udp',
            UdpInfo(RegistrationConsts),
            {
              port: 5101,
              destinationHost: '0.0.0.0',
              interface: 'any'
            }
          ).reify())
      .reify();
    return document.load(__filename, runtime, YAML.stringify(yaml));
  }

  let norsk: Norsk | undefined = undefined;

  after(async () => {
    await norsk?.close();
  })

  it("Should output some frames", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const udp = result.components["udp"] as SimpleSinkWrapper;
    const source = await videoAndAudio(norsk, 'source');

    const sink = await norsk.input.udpTs({
      id: 'sink',
      host: '127.0.0.1',
      port: 5101,
      sourceName: 'sink'
    });

    udp.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      {
        type: "take-all-streams", select: Av
      })])

    sink.outputStreams.length
    await waitForAssert(() => sink.outputStreams.length == 2, () => {
      expect(sink.outputStreams.length).equal(2);
    }, 5000, 10)
  })
});

