import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
import { FixedLadderConfig } from "../processor.fixedLadder/runtime";
import { testSourceDescription, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import { TraceSink, assertNodeOutputsVideoFrames } from "@norskvideo/norsk-studio/lib/test/_util/sinks";

import { RungName, createSoftwareRung } from "../processor.fixedLadder/info";
import FixedLadderInfo from "../processor.fixedLadder/info";
import { BaseConfig, NodeInfo, RegistrationConsts, Video } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleInputWrapper, SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("Fixed Ladder", () => {
  let norsk: Norsk = undefined!;
  let result: RunResult | undefined = undefined;
  let ladder: SimpleProcessorWrapper = undefined!;
  let source: SimpleInputWrapper = undefined!;
  let compiled: document.CompiledDocument = undefined!;

  async function sharedSetup(rungs: RungName[]) {
    const runtime = await defaultRuntime();
    let yaml = new YamlBuilder().reify();
    compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    yaml = new YamlBuilder().addNode(
      new YamlNodeBuilder<FixedLadderConfig>
        ('ladder',
          FixedLadderInfo(RegistrationConsts),
          {
            rungs: rungs.map((rung) => ({
              name: rung,
              software: createSoftwareRung(rung)
            }))
          }
        ).reify())
      .reify();
    compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    result = await go(norsk, compiled);
    ladder = result.components["ladder"] as SimpleProcessorWrapper;
    source = await videoAndAudio(norsk, 'source');

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

  describe("Ladder after source restart", () => {
    before(async () => {
      await sharedSetup(['h264_640x360']);
    })

    it("Outputs a single rung with the right resolution", async () => {

      const sink = new TraceSink(norsk as Norsk, "sink");
      await sink.initialised;

      sink.subscribe([
        new StudioNodeSubscriptionSource(ladder,
          compiled.components['ladder'].yaml, { type: 'take-all-streams', select: ["video"] },
          FixedLadderInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
      ])

      await waitForCondition(() => sink.streamCount() == 1);
      sink.subscribe([])
      await waitForCondition(() => sink.streamCount() == 0);

      ladder.subscribe([new StudioNodeSubscriptionSource(
        source,
        testSourceDescription(),
        { type: "take-all-streams", select: Video }
      )])

      await Promise.all([
        assertNodeOutputsVideoFrames(norsk, result as RunResult, "ladder", {
          resolution: { width: 640, height: 360 }
        }),
      ])
    });
  });

});

