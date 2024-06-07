import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { BrowserOverlayConfig } from "../processor.browserOverlay/runtime";
import { videoAndAudio, testSourceDescription } from "norsk-studio/lib/test/_util/sources";
import { BrowserOverlay } from "../processor.browserOverlay/runtime";
import { assertNodeOutputsVideoFrames } from "norsk-studio/lib/test/_util/sinks";

import BrowserOverlayInfo from "../processor.browserOverlay/info";
import { RegistrationConsts } from "norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "norsk-studio/lib/extension/runtime-types";

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
        new YamlNodeBuilder<BrowserOverlayConfig>
          ('browser',
            BrowserOverlayInfo(RegistrationConsts),
            {
              url: 'http://localhost:6791',
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
    const browser = result.nodes["browser"] as BrowserOverlay;

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

