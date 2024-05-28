import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "norsk-studio/lib/test/_util/builder"
import * as document from 'norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go, { RunResult } from 'norsk-studio/lib/runtime/execution';
import { FixedLadderConfig } from "../processor.fixedLadder/runtime";
import { testSourceDescription, videoAndAudio } from "norsk-studio/lib/test/_util/sources";
import { assertNodeOutputsVideoFrames } from "norsk-studio/lib/test/_util/sinks";

import FixedLadderInfo, { RungName } from "../processor.fixedLadder/info";
import { RegistrationConsts, Video } from "norsk-studio/lib/extension/client-types";
import { SimpleProcessorWrapper } from "norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "norsk-studio/lib/extension/runtime-types";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("Fixed Ladder", () => {
  let norsk: Norsk | undefined = undefined;
  let result: RunResult | undefined = undefined;

  async function sharedSetup(rungs: RungName[]) {
    const runtime = await defaultRuntime();
    let yaml = new YamlBuilder().reify();
    let compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    yaml = new YamlBuilder().addNode(
      new YamlNodeBuilder<FixedLadderConfig>
        ('ladder',
          FixedLadderInfo(RegistrationConsts),
          {
            rungs
          }
        ).reify())
      .reify();
    compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    result = await go(norsk, compiled);
    const ladder = result.nodes["ladder"] as SimpleProcessorWrapper;
    const source = await videoAndAudio(norsk, 'source');

    ladder.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-all-streams", select: Video }
    )])
  }

  afterEach(async () => {
    await norsk?.close();
  })

  describe("Ladder with single rung", () => {
    before(async () => {
      await sharedSetup(['h264_640x360']);
    })

    it("Outputs a single rung with the right resolution", async () => {
      if (!norsk) throw "Oh no";
      await Promise.all([
        assertNodeOutputsVideoFrames(norsk, result as RunResult, "ladder", {
          resolution: { width: 640, height: 360 }
        }),
      ])
    });
  });

  describe("Ladder with multiple rungs", () => {
    before(async () => {
      await sharedSetup(['h264_640x360', 'h264_320x180']);
    })
    it("Outputs multiple rungs with the right resolution", async () => {
      if (!norsk) throw "Oh no";

      await Promise.all([
        assertNodeOutputsVideoFrames(norsk, result as RunResult, "ladder", {
          match: { renditionName: 'h264_640x360' },
          resolution: { width: 640, height: 360 }
        }),
        assertNodeOutputsVideoFrames(norsk, result as RunResult, "ladder", {
          match: { renditionName: 'h264_320x180' },
          resolution: { width: 320, height: 180 }
        }),
      ])
    })
  });
});

