import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { DynamicBugCommand, DynamicBugConfig, DynamicBugEvent, DynamicBugState } from "../processor.dynamicBug/runtime";
import { videoAndAudio, testSourceDescription } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import { DynamicBug } from "../processor.dynamicBug/runtime";
import { TraceSink, assertNodeOutputsVideoFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";

import DynamicBugInfo from "../processor.dynamicBug/info";
import { BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("Dynamic Bug", () => {

  async function testDocument(cfg?: Omit<DynamicBugConfig, "id" | "displayName" | "__global">) {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<DynamicBugConfig, DynamicBugState, DynamicBugCommand, DynamicBugEvent>
          ('bug',
            DynamicBugInfo(RegistrationConsts),
            cfg ?? {

            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;

  afterEach(async () => {
    await norsk?.close();
    norsk = undefined;
  })

  it("Dynamic bug with no configuration, passthrough", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as DynamicBug;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    const videoOpts = {
      resolution: { width: 640, height: 360 },
      frameRate: { frames: 25, seconds: 1 }
    }

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    bug.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])
    await Promise.all([
      assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
    ])
  })

  it("Dynamic bug with no configuration, source change", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as DynamicBug;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    sink.subscribe([
      new StudioNodeSubscriptionSource(bug, compiled.components['bug'].yaml,
        { type: 'take-all-streams', select: ["audio", "video"] }, DynamicBugInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
    ])

    const videoOptsOne = {
      resolution: { width: 640, height: 360 },
      frameRate: { frames: 25, seconds: 1 }
    }

    const videoOptsTwo = {
      resolution: { width: 800, height: 600 },
      frameRate: { frames: 25, seconds: 1 }
    }

    const sourceOne = await videoAndAudio(norsk, 'sourceOne', videoOptsOne);

    bug.subscribe([new StudioNodeSubscriptionSource(sourceOne,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])
    await waitForCondition(() => sink.streamCount() == 1, 10000.0);
    await sourceOne.close();

    await waitForCondition(() => sink.streamCount() == 0, 10000.0);

    const sourceTwo = await videoAndAudio(norsk, 'sourceTwo', videoOptsTwo);

    bug.subscribe([new StudioNodeSubscriptionSource(sourceTwo,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    // Browser overlay outputs the same as it gets in, only with extra browser overlay
    await Promise.all([
      await waitForAssert(() => sink.streamCount() == 1, () => sink.streamCount() == 1, 10000, 500),
      assertNodeOutputsVideoFrames(norsk, result, "bug", videoOptsTwo),
    ])
  })

  it("Dynamic bug with initial configured image", async () => {
    const compiled = await testDocument({
      defaultBug: "test.png",
      defaultPosition: "bottomleft"
    });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as DynamicBug;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    const videoOpts = {
      resolution: { width: 640, height: 360 },
      frameRate: { frames: 25, seconds: 1 }
    }

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    bug.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    function latestState() {
      return result.runtimeState.latest["bug"] as DynamicBugState;
    }

    await Promise.all([
      assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
      waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.file == "test.png"),
      waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.position == "bottomleft")
    ])
  })
  it("Dynamic bug with no configured image, configured during run", async () => {
    const compiled = await testDocument({
    });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as DynamicBug;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;


    const videoOpts = {
      resolution: { width: 640, height: 360 },
      frameRate: { frames: 25, seconds: 1 }
    }

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    bug.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    await bug.setupBug("test.png", "bottomleft")

    function latestState() {
      return result.runtimeState.latest["bug"] as DynamicBugState;
    }

    await Promise.all([
      assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
      waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.file == "test.png"),
      waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.position == "bottomleft")
    ])
  })

  it("Dynamic bug with configured image, re-configured during run", async () => {
    const compiled = await testDocument({
      defaultBug: "test.png",
      defaultPosition: "bottomleft"
    });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as DynamicBug;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;


    const videoOpts = {
      resolution: { width: 640, height: 360 },
      frameRate: { frames: 25, seconds: 1 }
    }

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    bug.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    await bug.setupBug("test2.png", "bottomleft")

    function latestState() {
      return result.runtimeState.latest["bug"] as DynamicBugState;
    }

    await Promise.all([
      assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
      waitForAssert(() => latestState().activeBug?.file == "test2.png", () => latestState().activeBug?.file == "test2.png"),
      waitForAssert(() => latestState().activeBug?.file == "test2.png", () => latestState().activeBug?.position == "bottomleft")
    ])
  })
});
