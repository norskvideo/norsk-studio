import { Norsk, } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder } from "norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { audio, video, videoAndAudio, testSourceDescription } from "norsk-studio/lib/test/_util/sources";
import { AutoCmaf, AutoCmafConfig, CmafOutputCommand, CmafOutputEvent, CmafOutputState } from "../output.autoCmaf/runtime";
import * as HLS from 'hls-parser';
import fetch from "node-fetch";
import { types } from "hls-parser";
import AutoCmafInfo from "../output.autoCmaf/info";
import { RegistrationConsts } from "norsk-studio/lib/extension/client-types";
import { CreatedMediaNode, StudioNodeSubscriptionSource } from "norsk-studio/lib/extension/runtime-types";
import { testRuntime } from "norsk-studio/lib/test/_util/runtime";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = await testRuntime();
  await registerAll(runtime);
  return runtime;
}

// The behaviour of the autocmaf node is simple at the moment
// in that it doesn't attempt any cleanup and assumes streams are fully continuous
// It's also not clear what our rules around stream keys are and I think that is going to have to
// become a lot more concrete in Studio than we've left it in the SDK thus far
// I expect this suite to evolve as that does
describe("Auto CMAF Output", () => {
  async function sharedSetup(norsk: Norsk, sources: CreatedMediaNode[]) {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<AutoCmafConfig, CmafOutputState, CmafOutputCommand, CmafOutputEvent>
          ('cmaf',
            AutoCmafInfo(RegistrationConsts),
            {
              name: 'default',
              sessionId: false,
              segments: {
                retentionPeriod: 60,
                targetPartDuration: 0.5,
                targetSegmentDuration: 2,
              },
              s3Destinations: [],
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml));

    const result = await go(norsk, compiled);
    const cmaf = result.nodes["cmaf"] as AutoCmaf;

    cmaf.subscribe(sources.map((s) => {
      return new StudioNodeSubscriptionSource(s,
        testSourceDescription(),
        {
          type: 'take-first-stream', select: ["video", "audio"]
        })
    }))
    return result;
  }

  async function awaitCompleteManifest(url: string, expectedStreams: number) {
    return new Promise<types.MasterPlaylist>((r) => {
      const i = setInterval(async () => {
        const request = await fetch(url);

        if (request.ok) {
          const hls = await request.text();
          const parsed = HLS.parse(hls);

          if (parsed.isMasterPlaylist) {

            const master = parsed as types.MasterPlaylist;
            const current = master.variants.reduce((acc, v) => {
              acc.add(v.uri);
              v.audio.forEach((a) => { if (a.uri) acc.add(a.uri) });
              return acc;
            }, new Set())
            if (current.size >= expectedStreams) {
              clearInterval(i);
              r(master);
            }
          }
        }
      }, 10.0)
    })
  }

  describe("A single video and audio stream", () => {
    let norsk: Norsk | undefined = undefined;
    let result: RunResult | undefined = undefined;

    afterEach(async () => {
      await norsk?.close();
    })

    beforeEach(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      const source = await videoAndAudio(norsk, 'source');
      result = await sharedSetup(norsk, [source]);
    })

    it("Spins up a multi-variant playlist with the one stream", async () => {
      const mv = result?.registeredOutputs.find((s) => s.url?.endsWith("default.m3u8"));
      expect(mv).exist;

      // We can probably assume that if the playlists are in the manifest that they exist in Norsk, there (will be) tests for that over there
      if (mv?.url) {
        const finalManifest = await awaitCompleteManifest(mv.url, 2);
        expect(finalManifest.variants).length(1);
        expect(finalManifest.variants[0]?.audio).length(1);
      }
    })
  });
  describe("Two videos and one audio stream", () => {
    let norsk: Norsk | undefined = undefined;
    let result: RunResult | undefined = undefined;

    afterEach(async () => {
      await norsk?.close();
    })

    beforeEach(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      const video1 = await video(norsk, 'source1', { renditionName: "high", sourceName: "source" });
      const video2 = await video(norsk, 'source2', { renditionName: "low", sourceName: "source" });
      const audio1 = await audio(norsk, 'source3', { renditionName: "default", sourceName: "source" });
      result = await sharedSetup(norsk, [video1, video2, audio1]);
    })

    it("Spins up a multi-variant playlist with all the streams", async () => {
      const mv = result?.registeredOutputs.find((s) => s.url?.endsWith("default.m3u8"));
      expect(mv).exist;

      // We can probably assume that if the playlists are in the manifest that they exist in Norsk, there (will be) tests for that over there
      if (mv?.url) {
        const finalManifest = await awaitCompleteManifest(mv.url, 3);
        expect(finalManifest.variants).length(2);
        expect(finalManifest.variants[0]?.audio).length(1);
      }
    })
  });
});

