import { Norsk, } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { audio, video, videoAndAudio, testSourceDescription } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import { AutoCmaf, AutoCmafConfig, CmafOutputCommand, CmafOutputEvent, CmafOutputState } from "../output.autoCmaf/runtime";
import * as HLS from 'hls-parser';
import fetch from "node-fetch";
import { types } from "hls-parser";
import AutoCmafInfo from "../output.autoCmaf/info";
import { RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { CreatedMediaNode, StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { testRuntime } from "@norskvideo/norsk-studio/lib/test/_util/runtime";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";
import { SimpleInputWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = await testRuntime();
  await registerAll(runtime);
  return runtime;
}

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
              akamaiDestinations: []
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml));

    const result = await go(norsk, compiled);
    const cmaf = result.components["cmaf"] as AutoCmaf;

    function doSubscribe() {
      cmaf.subscribe(sources.map((s) => {
        return new StudioNodeSubscriptionSource(s,
          testSourceDescription(),
          {
            type: 'take-first-stream', select: ["video", "audio"]
          })
      }))
    }

    // This is what norsk studio itself does
    sources.forEach((s) => {
      s.relatedMediaNodes.onChange(() => {
        doSubscribe();
      })
    })

    doSubscribe();

    function setSources(newSources: CreatedMediaNode[]) {
      sources = newSources;
      doSubscribe();
    }

    return { doSubscribe, setSources, ...result };
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
            if (current.size === expectedStreams) {
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

  describe("Two sources", () => {
    let norsk: Norsk | undefined = undefined;
    let result: RunResult = undefined!;

    afterEach(async () => {
      await norsk?.close();
    })

    beforeEach(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      const video1 = await video(norsk, 'source1-video', { renditionName: "high", sourceName: "source1" });
      const video2 = await video(norsk, 'source2-video', { renditionName: "high", sourceName: "source2" });
      const audio1 = await audio(norsk, 'source1-audio', { renditionName: "default", sourceName: "source1" });
      const audio2 = await audio(norsk, 'source2-audio', { renditionName: "default", sourceName: "source2" });
      result = await sharedSetup(norsk, [video1, video2, audio1, audio2]);
    })

    it("Spins up a multi-variant playlist with all the streams", async () => {
      await waitForCondition(() => result?.registeredOutputs.length === 3);
      const firstOne = result.registeredOutputs.find((s) => s.url?.endsWith("default.m3u8"));
      const source1 = result?.registeredOutputs.find((s) => s.url?.endsWith("source1-1.m3u8"));
      const source2 = result?.registeredOutputs.find((s) => s.url?.endsWith("source2-1.m3u8"));

      expect(firstOne?.url).not.empty;
      expect(source1?.url).not.empty;
      expect(source2?.url).not.empty;

      const defaultManifest = await awaitCompleteManifest(firstOne!.url!, 2)
      const sourceOneManifest = await awaitCompleteManifest(source1!.url!, 2)
      const sourceTwoManifest = await awaitCompleteManifest(source2!.url!, 2)

      expect(defaultManifest.variants).length(1);
      expect(defaultManifest.variants[0]?.audio).length(1);

      expect(sourceOneManifest.variants).length(1);
      expect(sourceOneManifest.variants[0]?.audio).length(1);

      expect(sourceTwoManifest.variants).length(1);
      expect(sourceTwoManifest.variants[0]?.audio).length(1);

    })
  });

  describe("Stream within a source goes away", () => {
    let norsk: Norsk | undefined = undefined;
    let result: RunResult = undefined!;
    let video1: SimpleInputWrapper = undefined!;
    let video2: SimpleInputWrapper = undefined!;
    let video3: SimpleInputWrapper = undefined!;
    let audio1: SimpleInputWrapper = undefined!;
    let audio2: SimpleInputWrapper = undefined!;

    afterEach(async () => {
      await norsk?.close();
    })

    beforeEach(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      video1 = await video(norsk, 'source1-video', { renditionName: "high", sourceName: "source1" });
      video2 = await video(norsk, 'source2-video', { renditionName: "high", sourceName: "source2" });
      video3 = await video(norsk, 'source1-video-low', { renditionName: "low", sourceName: "source1" });
      audio1 = await audio(norsk, 'source1-audio', { renditionName: "default", sourceName: "source1" });
      audio2 = await audio(norsk, 'source2-audio', { renditionName: "default", sourceName: "source2" });
      result = await sharedSetup(norsk, [video1, video2, audio1, audio2, video3]);
    })

    it("Removes the media stream from the multivariant", async () => {
      await waitForCondition(() => result?.registeredOutputs.length === 3);

      const source1 = result?.registeredOutputs.find((s) => s.url?.endsWith("source1-1.m3u8"));
      const source2 = result?.registeredOutputs.find((s) => s.url?.endsWith("source2-1.m3u8"));

      await awaitCompleteManifest(source1!.url!, 3)
      await awaitCompleteManifest(source2!.url!, 2)

      await video3.close();

      const sourceOneManifest = await awaitCompleteManifest(source1!.url!, 2)
      const sourceTwoManifest = await awaitCompleteManifest(source2!.url!, 2)

      expect(sourceOneManifest.variants).length(1);
      expect(sourceOneManifest.variants[0]?.audio).length(1);

      expect(sourceTwoManifest.variants).length(1);
      expect(sourceTwoManifest.variants[0]?.audio).length(1);


    })
  });

  function streamGoesAwayAndComesBack(wait: boolean) {

    let norsk: Norsk = undefined!;
    let result: RunResult & { setSources: (sources: CreatedMediaNode[]) => void } = undefined!;
    let video1: SimpleInputWrapper = undefined!;
    let video2: SimpleInputWrapper = undefined!;
    let audio1: SimpleInputWrapper = undefined!;

    after(async () => {
      await norsk?.close();
    })

    before(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      video1 = await video(norsk, 'source1-video', { renditionName: "high", sourceName: "source1" });
      video2 = await video(norsk, 'source2-video', { renditionName: "medium", sourceName: "source1" });
      audio1 = await audio(norsk, 'source1-audio', { renditionName: "default", sourceName: "source1" });
      result = await sharedSetup(norsk, [video1, video2, audio1]);
    })

    it("Removes the stream from the multi-variant then re-adds it", async () => {
      await waitForCondition(() => result?.registeredOutputs.length === 2);
      const source1 = result?.registeredOutputs.find((s) => s.url?.endsWith("source1-1.m3u8"));
      await awaitCompleteManifest(source1!.url!, 3)
      await video2.close();

      if (wait)
        await awaitCompleteManifest(source1!.url!, 2)

      video2 = await video(norsk, 'source2-video', { renditionName: "medium", sourceName: "source1" });

      result.setSources([video1, video2, audio1]);

      const sourceOneManifest = await awaitCompleteManifest(source1!.url!, 3)

      expect(sourceOneManifest.variants).length(2);
      expect(sourceOneManifest.variants[0]?.audio).length(1);
    })
  }

  describe("Stream within a source goes away and comes back, wait", () => {
    streamGoesAwayAndComesBack(true);
  });

  describe("Stream within a source goes away and comes back, no wait", () => {
    streamGoesAwayAndComesBack(true);
  });

  describe("Whole source goes away", () => {
    let norsk: Norsk = undefined!;
    let result: RunResult & { setSources: (sources: CreatedMediaNode[]) => void } = undefined!;
    let video1: SimpleInputWrapper = undefined!;
    let video2: SimpleInputWrapper = undefined!;
    let audio1: SimpleInputWrapper = undefined!;

    after(async () => {
      await norsk?.close();
    })

    before(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      video1 = await video(norsk, 'source1-video', { renditionName: "high", sourceName: "source1" });
      video2 = await video(norsk, 'source2-video', { renditionName: "medium", sourceName: "source1" });
      audio1 = await audio(norsk, 'source1-audio', { renditionName: "default", sourceName: "source1" });
      result = await sharedSetup(norsk, [video1, video2, audio1]);
    })

    it("Removes the multivariant", async () => {
      await waitForCondition(() => result?.registeredOutputs.length === 2);
      const source1 = result?.registeredOutputs.find((s) => s.url?.endsWith("source1-1.m3u8"));
      await awaitCompleteManifest(source1!.url!, 3)

      await audio1.close();
      await video2.close();
      await video1.close();

      async function playlistExists() {
        const response = await fetch(source1!.url!);
        return response.status == 200;
      }

      await waitForAssert(async () => !(await playlistExists()), async () => !(await playlistExists()));
    })
  });


  function wholeSourceGoesAwayComesBack(wait: boolean) {

    let norsk: Norsk = undefined!;
    let result: RunResult & { setSources: (sources: CreatedMediaNode[]) => void } = undefined!;
    let video1: SimpleInputWrapper = undefined!;
    let video2: SimpleInputWrapper = undefined!;
    let audio1: SimpleInputWrapper = undefined!;

    after(async () => {
      await norsk?.close();
    })

    before(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      video1 = await video(norsk, 'source1-video', { renditionName: "high", sourceName: "source1" });
      video2 = await video(norsk, 'source2-video', { renditionName: "medium", sourceName: "source1" });
      audio1 = await audio(norsk, 'source1-audio', { renditionName: "default", sourceName: "source1" });
      result = await sharedSetup(norsk, [video1, video2, audio1]);
    })

    it("Re-creates the multivariant", async () => {
      await waitForCondition(() => result?.registeredOutputs.length === 2);
      const source1 = result?.registeredOutputs.find((s) => s.url?.endsWith("source1-1.m3u8"));
      await awaitCompleteManifest(source1!.url!, 3)

      await audio1.close();
      await video2.close();
      await video1.close();

      async function playlistExists() {
        const response = await fetch(source1!.url!);
        return response.status == 200;
      }

      if (wait)
        await waitForCondition(async () => !(await playlistExists()));

      video1 = await video(norsk, 'source1-video', { renditionName: "high", sourceName: "source1" });
      video2 = await video(norsk, 'source2-video', { renditionName: "medium", sourceName: "source1" });
      audio1 = await audio(norsk, 'source1-audio', { renditionName: "default", sourceName: "source1" });
      result.setSources([video1, video2, audio1]);

      const finalManifest = await awaitCompleteManifest(source1!.url!, 3)
      expect(finalManifest.variants).length(2);
      expect(finalManifest.variants[0]?.audio).length(1);

    })

  }

  // Happy path
  describe("Whole source goes away and comes back again, wait", () => {
    wholeSourceGoesAwayComesBack(true);
  });

  // Did we write the async stuff properly so we don't end up with clashes?
  describe("Whole source goes away and comes back again, no wait", () => {
    wholeSourceGoesAwayComesBack(false);
  });
});

