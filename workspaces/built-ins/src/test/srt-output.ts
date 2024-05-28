import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "norsk-studio/lib/test/_util/builder"
import * as document from 'norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from 'norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { SrtOutputSettings } from "../output.srt/runtime";
import { testSourceDescription, videoAndAudio } from "norsk-studio/lib/test/_util/sources";
import { getStreams } from "norsk-studio/lib/test/_util/sinks";
import SrtInfo from "../output.srt/info";
import { Av, RegistrationConsts } from "norsk-studio/lib/extension/client-types";
import { SimpleSinkWrapper } from "norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "norsk-studio/lib/extension/runtime-types";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

// All we're really testing here
// is that we're spinning up the SRT node
// with some valid config and that we haven't made a huge snafu in doing so
describe("SRT Output", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<SrtOutputSettings>
          ('srt',
            SrtInfo(RegistrationConsts),
            {
              port: 5001,
              ip: '0.0.0.0',
              mode: 'listener',
              socketOptions: {}
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
    // I think we could be even smarter about this
    // and spin it up and wait for the standard 'debug' text t be output
    const ffprobe = getStreams('srt://127.0.0.1:5001?connect_timeout=10000');

    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled);
    const srt = result.nodes["srt"] as SimpleSinkWrapper;
    const source = await videoAndAudio(norsk, 'source');

    srt.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      {
        type: "take-all-streams",
        select: Av
      })])

    const streams = await ffprobe;

    // All we really need to assert here tbf
    expect(streams).lengthOf(2);
  })
});

