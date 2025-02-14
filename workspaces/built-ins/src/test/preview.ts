import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { PreviewMode, PreviewOutput, PreviewOutputCommand, PreviewOutputEvent, PreviewOutputSettings, PreviewOutputState } from "../output.preview/runtime";
import { testSourceDescription, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import PreviewOutputInfo from "../output.preview/info";
import { Av, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleInputWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

basicSuite("video_passthrough");
basicSuite("video_encode");
basicSuite("image");

function basicSuite(mode: PreviewMode) {
  describe(`Preview ${mode}`, () => {
    async function testDocument() {
      const runtime = await defaultRuntime();
      const yaml = new YamlBuilder()
        .addNode(
          new YamlNodeBuilder<PreviewOutputSettings, PreviewOutputState, PreviewOutputCommand, PreviewOutputEvent>
            ('preview',
              PreviewOutputInfo(RegistrationConsts),
              { previewMode: mode }
            ).reify())
        .reify();

      const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
      return compiled;
    }

    let norsk: Norsk | undefined = undefined;
    let preview: PreviewOutput = undefined!;
    let source: SimpleInputWrapper = undefined!;
    let result: RunResult = undefined!;

    afterEach(async () => {
      await norsk?.close();
    })

    beforeEach(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      const compiled = await testDocument();
      result = await go(norsk, compiled);
      preview = result.components["preview"] as PreviewOutput;
    })

    // We'll just look at state...
    it("With a source", async () => {
      source = await videoAndAudio(norsk!, 'source');
      preview.subscribe([new StudioNodeSubscriptionSource(
        source,
        testSourceDescription(),
        { type: "take-all-streams", select: Av }
      )])

      const latestState = () => {
        return result?.runtimeState.getNodeState('preview') as (PreviewOutputState | undefined)
      }

      await waitForAssert(
        () => !!(latestState())?.url,
        () => expect(latestState()?.url).not.undefined,
        10000.0,
        10.0
      )

      await waitForAssert(
        () => !!(latestState())?.levels,
        () => expect(latestState()?.levels).not.undefined,
        10000.0,
        10.0
      )
    })

    it("Without a source", async () => {
      const latestState = () => {
        return result?.runtimeState.getNodeState('preview') as (PreviewOutputState | undefined)
      }

      await waitForAssert(
        () => !(latestState())?.url,
        () => expect(latestState()?.url).undefined,
        10000.0,
        10.0
      )

      await waitForAssert(
        () => !(latestState())?.levels,
        () => expect(latestState()?.levels).undefined,
        10000.0,
        10.0
      )
    })

    it("Source goes away", async () => {
      source = await videoAndAudio(norsk!, 'source');
      preview.subscribe([new StudioNodeSubscriptionSource(
        source,
        testSourceDescription(),
        { type: "take-all-streams", select: Av }
      )])

      const latestState = () => {
        return result?.runtimeState.getNodeState('preview') as (PreviewOutputState | undefined)
      }

      await waitForCondition(() => !!latestState()?.url);
      await source.close();
      preview.subscribe([]);

      await waitForAssert(
        () => !(latestState())?.url,
        () => expect(latestState()?.url).undefined,
        10000.0,
        10.0
      )

      await waitForAssert(
        () => !(latestState())?.levels,
        () => expect(latestState()?.levels).undefined,
        10000.0,
        10.0
      )
    })

    it("Source goes away and comes back", async () => {
      source = await videoAndAudio(norsk!, 'source');

      preview.subscribe([new StudioNodeSubscriptionSource(
        source,
        testSourceDescription(),
        { type: "take-all-streams", select: Av }
      )])

      const latestState = () => {
        return result?.runtimeState.getNodeState('preview') as (PreviewOutputState | undefined)
      }

      await waitForCondition(() => !!latestState()?.url, 60000);
      await source.close();

      preview.subscribe([]);

      source = await videoAndAudio(norsk!, 'source');

      preview.subscribe([new StudioNodeSubscriptionSource(
        source,
        testSourceDescription(),
        { type: "take-all-streams", select: Av }
      )])

      await waitForAssert(
        () => !!(latestState())?.url,
        () => expect(latestState()?.url).not.undefined,
        60000.0,
        10.0
      )

      await waitForAssert(
        () => !!(latestState())?.levels,
        () => expect(latestState()?.levels).not.undefined,
        60000.0,
        10.0
      )

    })
  });
}
