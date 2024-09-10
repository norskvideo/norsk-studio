import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { BrowserOverlayCommand, BrowserOverlayConfig, BrowserOverlayEvent, BrowserOverlayState } from "../processor.browserOverlay/runtime";
import { videoAndAudio, testSourceDescription } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import { BrowserOverlay } from "../processor.browserOverlay/runtime";
import { TraceSink, assertNodeOutputsVideoFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";

import BrowserOverlayInfo from "../processor.browserOverlay/info";
import { BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("Browser Overlay", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<BrowserOverlayConfig, BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>
          ('browser',
            BrowserOverlayInfo(RegistrationConsts),
            {
              url: 'http://127.0.0.1:6791',
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;

  after(async () => {
    await norsk?.close();
  })

  it("Outputs video that matches the input video", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const browser = result.components["browser"] as BrowserOverlay;

    const videoOpts = {
      resolution: { width: 640, height: 360 },
      frameRate: { frames: 25, seconds: 1 }
    }

    const source = await videoAndAudio(norsk, 'source', videoOpts);

    browser.subscribe([new StudioNodeSubscriptionSource(source,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    // Browser overlay outputs the same as it gets in, only with extra browser overlay
    await Promise.all([
      assertNodeOutputsVideoFrames(norsk, result, "browser", videoOpts),
    ])
  })
});

describe("Browser Overlay with restart", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<BrowserOverlayConfig, BrowserOverlayState, BrowserOverlayCommand, BrowserOverlayEvent>
          ('browser',
            BrowserOverlayInfo(RegistrationConsts),
            {
              url: 'http://127.0.0.1:6791',
            }
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;

  after(async () => {
    await norsk?.close();
  })

  it("Outputs video that matches the input video", async () => {
    const compiled = await testDocument();
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const result = await go(norsk, compiled);
    const browser = result.components["browser"] as BrowserOverlay;
    const sink = new TraceSink(norsk as Norsk, "sink");
    await sink.initialised;

    sink.subscribe([
      new StudioNodeSubscriptionSource(browser, compiled.components['browser'].yaml,
        { type: 'take-all-streams', select: ["audio", "video"] }, BrowserOverlayInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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

    browser.subscribe([new StudioNodeSubscriptionSource(sourceOne,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])
    await waitForCondition(() => sink.streamCount() == 1, 10000.0);
    await sourceOne.close();
    // this is what studio does for you
    browser.subscribe([]);

    await waitForCondition(() => sink.streamCount() == 0, 10000.0);

    const sourceTwo = await videoAndAudio(norsk, 'sourceTwo', videoOptsTwo);

    browser.subscribe([new StudioNodeSubscriptionSource(sourceTwo,
      testSourceDescription(),
      {
        type: 'take-all-streams', select: ['video']
      })
    ])

    // Browser overlay outputs the same as it gets in, only with extra browser overlay
    await Promise.all([
      await waitForAssert(() => sink.streamCount() == 1, () => sink.streamCount() == 1, 10000, 500),
      assertNodeOutputsVideoFrames(norsk, result, "browser", videoOptsTwo),
    ])
  })
});

