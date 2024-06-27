import { Norsk } from "@norskvideo/norsk-sdk";
import { Av, BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { YamlBuilder, YamlNodeBuilder } from "@norskvideo/norsk-studio/lib/test/_util/builder";
import { AvMultiInput, testRuntime as builtInRuntime } from "@norskvideo/norsk-studio/lib/test/_util/runtime";
import { assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { testSourceDescription, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import YAML from 'yaml';
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
import cameraSelectInfo from '../info';
import MultiCameraSelectDefinition, { MultiCameraSelect, MultiCameraSelectCommand, MultiCameraSelectState } from "../runtime";
import { expect } from "chai";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";
import { debuglog } from "@norskvideo/norsk-studio/lib/server/logging";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";


const CameraSelectInfo = cameraSelectInfo(RegistrationConsts);

async function testRuntime() {
  const runtime = await builtInRuntime();
  runtime.registerComponent(new MultiCameraSelectDefinition(), CameraSelectInfo, "");
  return runtime;
}


describe("Multi camera select", () => {
  const config = {
    id: 'ss',
    displayName: "sss",
    resolution: {
      width: 1920,
      height: 1080
    },
    frameRate: {
      frames: 25,
      seconds: 1
    },
    sampleRate: 48000,
    channelLayout: "mono",
  } as const;
  describe("Runtime  - Component", () => {
    let norsk: Norsk | undefined = undefined;
    let result: RunResult | undefined = undefined;

    afterEach(async () => {
      await norsk?.close();
      await new Promise<void>((r) => {
        setTimeout(() => {
          r();
        }, 10.0)
      })
      norsk = undefined;
      result = undefined;
    })

    const latestState = () => {
      return result?.runtimeState.getNodeState('select') as (MultiCameraSelectState)
    }

    const sendCommand = (command: MultiCameraSelectCommand) => {
      const definition = (result?.document.components["select"].definition as unknown) as MultiCameraSelectDefinition;
      const node = result?.components["select"] as MultiCameraSelect;
      debuglog("Sending command to node", { id: node.id, command })
      definition.handleCommand(node, command)
    }

    const compileDocument = async () => {
      const runtime = await testRuntime();

      const yaml = new YamlBuilder()
        .addNode(new YamlNodeBuilder('select', CameraSelectInfo, config).reify()
        ).reify();

      return document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    }

    describe("No inputs", () => {
      it("Should output A/V from the fallback source", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await compileDocument();
        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState()?.availableSources.length == 1,
            () => {
              expect(switcher.activeSource.id).equals('fallback', "Active source on component");
              expect(latestState()?.activeSource.id).equals('fallback', "active source on runtime state");
              expect(latestState()?.availableSources).length(1, "available sources")
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
            },
            60000.0,
            10.0
          ),
        ]);
      })
    });

    describe("Single input, no commands sent", () => {
      it("Should output A/V from the fallback source", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const source = await videoAndAudio(norsk, "primary");
        const compiled = await compileDocument();
        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: "take-first-stream", select: Av })]);
        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState()?.availableSources.length == 2,
            () => {
              expect(switcher.activeSource.id).equals('fallback', "Active source on component");
              expect(latestState()?.activeSource.id).equals('fallback', "active source in runtime state")
              expect(latestState()?.availableSources).length(2, "available sources")
              expect(latestState()?.availableSources.map((s) => s.id)).contains('primary')
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
            },
            10000.0,
            10.0
          ),
        ]);
      })
    });

    describe("Sending a switch source command when the source exists", () => {
      it("switches to that source", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const source = await videoAndAudio(norsk, "primary");
        const compiled = await compileDocument();
        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: "take-first-stream", select: Av })]);

        await waitForCondition(() => latestState()?.availableSources.length == 2)

        sendCommand({
          type: 'select-source', source: { id: 'primary' }, overlays: []
        })

        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState()?.activeSource.id == 'primary',
            () => {
              expect(switcher.activeSource.id).equals('primary', "Active source on component");
              expect(latestState()?.activeSource.id).equals('primary', "active source in runtime state")
              expect(latestState()?.availableSources).length(2, "available sources")
              expect(latestState()?.availableSources.map((s) => s.id)).contains('primary')
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
            },
            10000.0,
            10.0
          ),
        ]);
      })
    });

    describe("Sending a switch source command when the source does not exist", () => {
      it("leaves the current source intact", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const source = await videoAndAudio(norsk, "primary");
        const compiled = await compileDocument();
        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: "take-first-stream", select: Av })]);
        await waitForCondition(() => latestState()?.availableSources.length == 2)
        sendCommand({
          type: 'select-source', source: { id: 'primary' }, overlays: []
        })
        await waitForCondition(() => latestState()?.activeSource.id == 'primary')
        sendCommand({
          type: 'select-source', source: { id: 'utter nonsense' }, overlays: []
        })

        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState()?.activeSource.id == 'primary',
            () => {
              expect(switcher.activeSource.id).equals('primary', "Active source on component");
              expect(latestState()?.activeSource.id).equals('primary', "active source in runtime state")
              expect(latestState()?.availableSources).length(2, "available sources")
              expect(latestState()?.availableSources.map((s) => s.id)).contains('primary')
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
            },
            10000.0,
            10.0
          ),
        ]);
      })
    });

    describe("terminating the active source", () => {
      it("switches to fallback, removes the source from available", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const source = await videoAndAudio(norsk, "primary");
        const compiled = await compileDocument();
        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: "take-first-stream", select: Av })]);
        await waitForCondition(() => latestState()?.availableSources.length == 2 && latestState()?.activeSource.id == 'fallback')
        sendCommand({
          type: 'select-source', source: { id: 'primary' }, overlays: []
        })
        await waitForCondition(() => latestState()?.activeSource.id == 'primary')

        await source.close();

        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState().availableSources.length == 1 && latestState()?.activeSource.id == 'fallback',
            () => {
              expect(switcher.activeSource.id).equals('fallback', "Active source on component");
              expect(latestState()?.activeSource.id).equals('fallback', "active source on runtime state");
              expect(latestState()?.availableSources).length(1, "available sources")
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
            },
            10000.0,
            10.0
          ),
        ]);
      })
    });

    describe("reviving a previously active source after termination", () => {
      it("stays on fallback, source is available", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const source = await videoAndAudio(norsk, "primary");
        const compiled = await compileDocument();
        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: "take-first-stream", select: Av })]);
        await waitForCondition(() => latestState()?.availableSources.length == 2 && latestState()?.activeSource.id == 'fallback')
        sendCommand({
          type: 'select-source', source: { id: 'primary' }, overlays: []
        })
        await waitForCondition(() => latestState()?.activeSource.id == 'primary')
        switcher.subscribe([]);

        await waitForCondition(() => latestState()?.availableSources.length == 1 && latestState()?.activeSource.id == 'fallback')
        switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: "take-first-stream", select: Av })]);

        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState()?.availableSources.length == 2,
            () => {
              expect(switcher.activeSource.id).equals('fallback', "Active source on component");
              expect(latestState()?.activeSource.id).equals('fallback', "active source on runtime state");
              expect(latestState()?.availableSources).length(2, "available sources")
              expect(latestState()?.availableSources.map((s) => s.id)).contains('primary')
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
            },
            10000.0,
            10.0
          ),
        ]);
      })
    });

    describe("subscribing to a multi-av input", () => {
      it("the subscribed-to entries are listed as known/available streams", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const sourceConfig = { id: 'foo', displayName: 'Foo', inputs: ["one", "two", "three"] }
        const runtime = await testRuntime();
        const yaml = new YamlBuilder()
          .addNode(new YamlNodeBuilder('source', AvMultiInput.info, sourceConfig).reify())
          .addNode(new YamlNodeBuilder('select', CameraSelectInfo, config).reify())
          .reify();

        const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });

        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        const source = result.components['source'];

        switcher.subscribe([new StudioNodeSubscriptionSource(source, compiled.components['source'].yaml, { type: "take-specific-streams", select: Av, filter: ["one", "two"] }, AvMultiInput.info as unknown as NodeInfo<BaseConfig>)]);

        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState()?.availableSources.length == 3,
            () => {
              expect(switcher.activeSource.id).equals('fallback', "Active source on component");
              expect(latestState()?.activeSource.id).equals('fallback', "active source on runtime state");
              expect(latestState()?.availableSources).length(3, "available sources")
              expect(latestState()?.availableSources.map((s) => s.key)).contains('one')
              expect(latestState()?.availableSources.map((s) => s.key)).contains('two')
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
              expect(latestState()?.knownSources.map((s) => s.key)).contains('one')
              expect(latestState()?.knownSources.map((s) => s.key)).contains('two')
              expect(latestState()?.knownSources.map((s) => s.id)).contains('fallback')
            },
            10000.0,
            10.0
          ),
        ]);
      })

      it("Unavailable entries are shown as known about but not available", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const sourceConfig = { id: 'source', displayName: "source", inputs: ["one", "two", "three"] }
        const runtime = await testRuntime();
        const yaml = new YamlBuilder()
          .addNode(new YamlNodeBuilder('source', AvMultiInput.info, sourceConfig).reify())
          .addNode(new YamlNodeBuilder('select', CameraSelectInfo, config).reify())
          .reify();

        const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });

        result = await go(norsk, compiled);
        const switcher = result.components['select'] as MultiCameraSelect;
        const source = result.components['source'];


        const sourceNodeDescription = compiled.components['source'].yaml;
        sourceNodeDescription.config = { ...sourceConfig, inputs: ['nope', ...sourceConfig.inputs] } as BaseConfig;

        switcher.subscribe([new StudioNodeSubscriptionSource(source, sourceNodeDescription, { type: "take-specific-streams", select: Av, filter: ["one", "two", "nope"] }, AvMultiInput.info as unknown as NodeInfo<BaseConfig>)]);

        await Promise.all([
          assertNodeOutputsAudioFrames(norsk, result, 'select'),
          assertNodeOutputsVideoFrames(norsk, result, 'select'),
          waitForAssert(
            () => latestState()?.availableSources.length == 3,
            () => {
              expect(switcher.activeSource.id).equals('fallback', "Active source on component");
              expect(latestState()?.activeSource.id).equals('fallback', "active source on runtime state");
              expect(latestState()?.availableSources).length(3, "available sources")
              expect(latestState()?.availableSources.map((s) => s.key)).contains('one')
              expect(latestState()?.availableSources.map((s) => s.key)).contains('two')
              expect(latestState()?.availableSources.map((s) => s.id)).contains('fallback')
              expect(latestState()?.knownSources.map((s) => s.key)).contains('one')
              expect(latestState()?.knownSources.map((s) => s.key)).contains('two')
              expect(latestState()?.knownSources.map((s) => s.key)).contains('nope')
              expect(latestState()?.knownSources.map((s) => s.id)).contains('fallback')
            },
            10000.0,
            10.0
          ),
        ]);
      })
    });
  })

})
