import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import { AddressInfo } from 'net';
import { Server } from 'http';
import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
import { OnscreenGraphicCommand, OnscreenGraphicConfig, OnscreenGraphicEvent, OnscreenGraphicState } from "../processor.onscreenGraphic/runtime";
import { videoAndAudio, testSourceDescription } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import { OnscreenGraphic } from "../processor.onscreenGraphic/runtime";
import { TraceSink, assertNodeOutputsVideoFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";

import OnscreenGraphicInfo from "../processor.onscreenGraphic/info";
import { BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";
import fetch from "node-fetch";

import express from 'express';
import { expect } from "chai";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

const videoOpts = {
  resolution: { width: 640, height: 360 },
  frameRate: { frames: 25, seconds: 1 }
}
const videoOptsOne = {
  resolution: { width: 640, height: 360 },
  frameRate: { frames: 25, seconds: 1 }
}

const videoOptsTwo = {
  resolution: { width: 800, height: 600 },
  frameRate: { frames: 25, seconds: 1 }
}

function apiUrl(id: string, port: number): string {
  return `http://127.0.0.1:${port}/${id}/active-bug`
}

describe("Dynamic Bug", () => {

  async function testDocument(cfg?: Omit<OnscreenGraphicConfig, "id" | "displayName" | "__global">) {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<OnscreenGraphicConfig, OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>
          ('bug',
            OnscreenGraphicInfo(RegistrationConsts),
            cfg ?? {

            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    return compiled;
  }

  let norsk: Norsk = undefined!;

  afterEach(async () => {
    await norsk?.close();
  })

  it("Dynamic bug with no configuration, passthrough", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as OnscreenGraphic;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;


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
    const bug = result.components["bug"] as OnscreenGraphic;

    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    sink.subscribe([
      new StudioNodeSubscriptionSource(bug, compiled.components['bug'].yaml,
        { type: 'take-all-streams', select: ["audio", "video"] }, OnscreenGraphicInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
    ])


    const sourceOne = await videoAndAudio(norsk, 'sourceOne', videoOptsOne);

    bug.subscribe([new StudioNodeSubscriptionSource(sourceOne,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])
    await waitForCondition(() => sink.streamCount() == 1, 10000.0);

    await sourceOne.close();

    // this is what studio does for you
    bug.subscribe([]);

    await waitForCondition(() => sink.streamCount() == 0, 60000.0);

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
      initialBug: "test.png",
      initialPosition: "bottomleft"
    });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as OnscreenGraphic;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    bug.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    function latestState() {
      return result.runtimeState.latest["bug"] as OnscreenGraphicState;
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
    const bug = result.components["bug"] as OnscreenGraphic;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    bug.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    await bug.setupBug("test.png", "bottomleft")

    function latestState() {
      return result.runtimeState.latest["bug"] as OnscreenGraphicState;
    }

    await Promise.all([
      assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
      waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.file == "test.png"),
      waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.position == "bottomleft")
    ])
  })

  it("Dynamic bug with configured image, re-configured during run", async () => {
    const compiled = await testDocument({
      initialBug: "test.png",
      initialPosition: "bottomleft"
    });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as OnscreenGraphic;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    bug.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    await bug.setupBug("test2.png", "bottomleft")

    function latestState() {
      return result.runtimeState.latest["bug"] as OnscreenGraphicState;
    }

    await Promise.all([
      assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
      waitForAssert(() => latestState().activeBug?.file == "test2.png", () => latestState().activeBug?.file == "test2.png"),
      waitForAssert(() => latestState().activeBug?.file == "test2.png", () => latestState().activeBug?.position == "bottomleft")
    ])
  })

  it("Dynamic bug with configured image, re-configured during run, source reset", async () => {
    const compiled = await testDocument({
      initialBug: "test.png",
      initialPosition: "bottomleft"
    });
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const bug = result.components["bug"] as OnscreenGraphic;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    sink.subscribe([
      new StudioNodeSubscriptionSource(bug, compiled.components['bug'].yaml,
        { type: 'take-all-streams', select: ["audio", "video"] }, OnscreenGraphicInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
    ])

    const sourceOne = await videoAndAudio(norsk, 'sourceOne', videoOptsOne);

    bug.subscribe([new StudioNodeSubscriptionSource(sourceOne,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])


    function latestState() {
      return result.runtimeState.latest["bug"] as OnscreenGraphicState;
    }


    await bug.setupBug("test2.png", "bottomleft")
    await waitForCondition(() => latestState().activeBug?.file == "test2.png");
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
      waitForAssert(() => latestState().activeBug?.file == "test2.png", () => latestState().activeBug?.file == "test2.png"),
      waitForAssert(() => latestState().activeBug?.file == "test2.png", () => latestState().activeBug?.position == "bottomleft")
    ])
  })

  describe("http api", () => {

    let port = 0;
    let result: RunResult = undefined!;
    let listener: Server = undefined!;
    let bug: OnscreenGraphic = undefined!;

    beforeEach(async () => {
      const compiled = await testDocument();
      norsk = await Norsk.connect({ onShutdown: () => { } });
      const app = express();
      app.use(express.json());
      result = await go(norsk, compiled, app);
      await new Promise<void>((r) => {
        listener = app.listen(0, '127.0.0.1', () => {
          const address = listener.address() as AddressInfo;
          port = address.port;
          r();
        });
      });
      // const address = listener.address() as AddressInfo;
      // port = address.port;
      bug = result.components["bug"] as OnscreenGraphic;
      const sink = new TraceSink(norsk as Norsk, "sink");
      await sink.initialised;

      const source = await videoAndAudio(norsk, 'source', videoOpts);

      bug.subscribe([new StudioNodeSubscriptionSource(source,
        testSourceDescription(),
        {
          type: 'take-all-streams', select: ['video']
        })
      ])
      sink.subscribe([
        new StudioNodeSubscriptionSource(bug, compiled.components['bug'].yaml,
          { type: 'take-all-streams', select: ["audio", "video"] }, OnscreenGraphicInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
      ])
      await waitForCondition(() => sink.streamCount() == 1, 10000.0);
    })

    afterEach(async () => {
      listener.close();
    })

    it("Setting active bug via the http api", async () => {
      const httpResult = await fetch(apiUrl(bug.id, port), {
        method: 'POST',
        body: JSON.stringify({
          bug: 'test.png',
          position: 'bottomleft'
        })
      });

      function latestState() {
        return result.runtimeState.latest["bug"] as OnscreenGraphicState;
      }

      expect(httpResult.status).equal(204);

      await Promise.all([
        assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
        waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.file == "test.png"),
        waitForAssert(() => latestState().activeBug?.file == "test.png", () => latestState().activeBug?.position == "bottomleft")
      ])
    })

    it("Clearing active bug via empty post to the http api", async () => {
      await bug.setupBug("test.png", "bottomleft")

      function latestState() {
        return result.runtimeState.latest["bug"] as OnscreenGraphicState;
      }

      const httpResult = await fetch(apiUrl(bug.id, port), {
        method: 'POST',
        body: JSON.stringify({
        })
      });

      expect(httpResult.status).equal(204);

      await Promise.all([
        assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
        waitForAssert(() => latestState().activeBug?.file == undefined, () => latestState().activeBug?.file == undefined),
        waitForAssert(() => latestState().activeBug?.file == undefined, () => latestState().activeBug?.position == undefined),
      ])
    })

    it("Clearing active bug via delete to the http api", async () => {
      await bug.setupBug("test.png", "bottomleft")

      function latestState() {
        return result.runtimeState.latest["bug"] as OnscreenGraphicState;
      }

      const httpResult = await fetch(apiUrl(bug.id, port), {
        method: 'delete'
      });

      expect(httpResult.status).equal(204);

      await Promise.all([
        assertNodeOutputsVideoFrames(norsk, result, "bug", videoOpts),
        waitForAssert(() => latestState().activeBug?.file == undefined, () => latestState().activeBug?.file == undefined),
        waitForAssert(() => latestState().activeBug?.file == undefined, () => latestState().activeBug?.position == undefined),
      ])
    })
  })
});
