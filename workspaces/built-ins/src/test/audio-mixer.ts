// import { Norsk } from "@norskvideo/norsk-sdk";
// import { Audio, BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
// import { YamlBuilder, YamlNodeBuilder } from "@norskvideo/norsk-studio/lib/test/_util/builder";
// import audioMixerInfo from '../processor.audioMixer/info';
// import YAML from 'yaml';
// import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
// import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
// import { AvMultiInput, testRuntime } from "@norskvideo/norsk-studio/lib/test/_util/runtime";
// import AudioMixerDefinition, { AudioMixer, AudioMixerCommand, AudioMixerState } from "../processor.audioMixer/runtime";
// import { assertNodeOutputsAudioFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
// import { expect } from "chai";
// import { audio, testSourceDescription } from "@norskvideo/norsk-studio/lib/test/_util/sources";
// import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
// import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";
// import { debuglog } from "@norskvideo/norsk-studio/lib/server/logging";
// import registerAll from "..";
// import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";

// async function defaultRuntime(): Promise<RuntimeSystem> {
//   const runtime = await testRuntime();
//   await registerAll(runtime);
//   return runtime;
// }

// const UnusedSourceDescription = testSourceDescription();

// const AudioMixerInfo = audioMixerInfo(RegistrationConsts);
// describe("Audio mixer", () => {
//   const config = { defaultGain: 0.0, id: "mixer", displayName: "mixer", channelLayout: "stereo" } as const;
//   describe("Runtime - Component", () => {

//     async function testDocument() {
//       const runtime = await defaultRuntime();
//       const yaml = new YamlBuilder()
//         .addNode(new YamlNodeBuilder('audio-mixer', AudioMixerInfo, config).reify()
//         ).reify();

//       const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
//       return compiled;
//     }

//     let norsk: Norsk | undefined = undefined;
//     let result: RunResult | undefined = undefined;

//     afterEach(async () => {
//       await norsk?.close();
//       norsk = undefined;
//       // await new Promise<void>((r) => {
//       //   setTimeout(() => {
//       //     r();
//       //   }, 5000.0)
//       // })
//       result = undefined;
//     })

//     const latestState = () => {
//       return result?.runtimeState.getNodeState('audio-mixer') as (AudioMixerState)
//     }

//     const sendCommand = (command: AudioMixerCommand) => {
//       const definition = (result?.document.components["audio-mixer"].definition as unknown) as AudioMixerDefinition;
//       const node = result?.components["audio-mixer"] as AudioMixer;
//       debuglog("Sending command to node", { id: node.id, command })
//       definition.handleCommand(node, command)
//     }

//     describe("No inputs", () => {
//       it("Should have the master output defined", async () => {
//         norsk = await Norsk.connect({ onShutdown: () => { } });
//         const compiled = await testDocument();
//         result = await go(norsk, compiled);
//         await Promise.all([
//           waitForAssert(
//             () => latestState()?.knownSources.length == 1,
//             () => {
//               const sourceKeys = Object.keys(latestState()?.sources || {})
//               expect(sourceKeys).length(1, "available sources")
//               expect(sourceKeys[0]).eq("mixer-output")
//             }
//           ),
//           10000,
//           50,
//         ]);
//       })
//     });

//     describe("Single input, no commands sent", () => {
//       it("Should output audio", async () => {
//         const compiled = await testDocument();
//         norsk = await Norsk.connect({ onShutdown: () => { } });
//         const source = await audio(norsk, "primary", { channelLayout: "stereo" });
//         result = await go(norsk, compiled);
//         const mixer = result.components['audio-mixer'] as AudioMixer;
//         mixer.subscribe([new StudioNodeSubscriptionSource(source, UnusedSourceDescription, { type: "take-first-stream", select: Audio })]);
//         await Promise.all([
//           assertNodeOutputsAudioFrames(norsk, result, 'audio-mixer'),
//           waitForAssert(
//             () => Object.keys(latestState()?.sources || []).length == 2,
//             () => {
//               const sourceKeys = Object.keys(latestState()?.sources || {})
//               expect(sourceKeys).length(2, "available sources")
//               expect(sourceKeys).contains("mixer-output", "master output found")
//               expect(sourceKeys).contains("primary", "additional source found")
//               const primaryLevels = latestState()?.sources["primary"]
//               expect(primaryLevels.levels).to.exist
//             },
//             10000,
//             500
//           ),
//         ])
//       })
//     });

//     describe("subscribing to multiple inputs", () => {
//       it("the subscribed-to entries are listed as known/available streams", async () => {
//         norsk = await Norsk.connect({ onShutdown: () => { } });
//         const sourceConfig = { id: "foo", displayName: "foo", inputs: ["one", "two"] }
//         const yaml = new YamlBuilder()
//           .addNode(new YamlNodeBuilder('source', AvMultiInput.info, sourceConfig).reify())
//           .addNode(new YamlNodeBuilder('audio-mixer', AudioMixerInfo, config).reify())
//           .reify();

//         const runtime = await defaultRuntime();
//         const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
//         result = await go(norsk, compiled);
//         const mixer = result.components['audio-mixer'] as AudioMixer;
//         const source = result.components['source'];
//         mixer.subscribe([new StudioNodeSubscriptionSource(source, compiled.components['source'].yaml, { type: "take-specific-streams", select: Audio, filter: ["one", "two"] }, AvMultiInput.info as unknown as NodeInfo<BaseConfig>)]);
//         await Promise.all([
//           assertNodeOutputsAudioFrames(norsk, result, 'audio-mixer'),
//           waitForAssert(
//             () => Object.keys(latestState()?.sources || []).length == 3,
//             () => {
//               const sourceKeys = Object.keys(latestState()?.sources || {})
//               expect(sourceKeys).length(3, "available sources")
//               expect(sourceKeys).contains('source-one')
//               expect(sourceKeys).contains('source-two')
//               expect(sourceKeys).contains('mixer-output')
//               expect(latestState()?.knownSources.map((s) => s.key)).contains('one')
//               expect(latestState()?.knownSources.map((s) => s.key)).contains('two')
//               expect(latestState()?.knownSources.map((s) => s.id)).contains('mixer-output')
//             },
//             10000.0,
//             10.0
//           ),
//         ]);
//       })

//       it("Unavailable entries are shown as known about but not available", async () => {
//         norsk = await Norsk.connect({ onShutdown: () => { } });
//         const sourceConfig = { id: "foo", displayName: "foo", inputs: ["one", "two", "three"] }
//         const runtime = await defaultRuntime();
//         const yaml = new YamlBuilder()
//           .addNode(new YamlNodeBuilder('source', AvMultiInput.info, sourceConfig).reify())
//           .addNode(new YamlNodeBuilder('audio-mixer', AudioMixerInfo, config).reify())
//           .reify();

//         const compiled = document.load(__filename, runtime, YAML.stringify(yaml));

//         result = await go(norsk, compiled);
//         const mixer = result.components['audio-mixer'] as AudioMixer;
//         const source = result.components['source'];

//         const sourceYaml = compiled.components["source"].yaml;
//         sourceYaml.config = { inputs: ['nope', ...sourceConfig.inputs], ...sourceYaml.config } as BaseConfig;

//         mixer.subscribe([new StudioNodeSubscriptionSource(source, sourceYaml, { type: "take-specific-streams", select: Audio, filter: ["one", "two", "nope"] }, AvMultiInput.info as unknown as NodeInfo<BaseConfig>)]);

//         await Promise.all([
//           assertNodeOutputsAudioFrames(norsk, result, 'audio-mixer'),
//           waitForAssert(
//             () => Object.keys(latestState()?.sources || []).length == 3,
//             () => {
//               const sourceKeys = Object.keys(latestState()?.sources || {})
//               expect(sourceKeys).length(3, "available sources")
//               expect(sourceKeys).contains('source-one')
//               expect(sourceKeys).contains('source-two')
//               expect(sourceKeys).contains('mixer-output')
//               expect(latestState()?.knownSources.map((s) => s.key)).contains('one')
//               expect(latestState()?.knownSources.map((s) => s.key)).contains('two')
//               expect(latestState()?.knownSources.map((s) => s.key)).contains('nope')
//               expect(latestState()?.knownSources.map((s) => s.id)).contains('mixer-output')
//             },
//             10000.0,
//             10.0
//           ),
//         ]);
//       })
//     })

//     describe("changing gain", () => {
//       it("should change slider gain", async () => {
//         norsk = await Norsk.connect({ onShutdown: () => { } });
//         const compiled = await testDocument();
//         const source = await audio(norsk, "primary");
//         result = await go(norsk, compiled);
//         const mixer = result.components['audio-mixer'] as AudioMixer;
//         mixer.subscribe([new StudioNodeSubscriptionSource(source, UnusedSourceDescription, { type: "take-first-stream", select: Audio })]);
//         await waitForCondition(() => Object.keys(latestState()?.sources || []).length == 2)
//         sendCommand({
//           type: 'set-gain-cmd', sourceId: "primary", value: -30
//         })
//         await assertNodeOutputsAudioFrames(norsk, result, 'audio-mixer').then((_res) => {
//           expect(latestState()?.sources["primary"]?.sliderGain).eq(-30)
//         })
//       })
//       it("should set channel on mute if low enough gain", async () => {
//         norsk = await Norsk.connect({ onShutdown: () => { } });
//         const compiled = await testDocument();
//         const source = await audio(norsk, "primary");
//         result = await go(norsk, compiled);
//         const mixer = result.components['audio-mixer'] as AudioMixer;
//         mixer.subscribe([new StudioNodeSubscriptionSource(source, UnusedSourceDescription, { type: "take-first-stream", select: Audio })]);
//         await waitForCondition(() => Object.keys(latestState()?.sources || []).length == 2)
//         sendCommand({
//           type: 'set-gain-cmd', sourceId: "primary", value: -99
//         })
//         await assertNodeOutputsAudioFrames(norsk, result, 'audio-mixer').then((_res) => {
//           expect(latestState()?.sources["primary"]?.nodeGain).null
//           expect(latestState()?.sources["primary"]?.isMuted).true
//         })
//       })
//       it("should mute a channel on command", async () => {
//         norsk = await Norsk.connect({ onShutdown: () => { } });
//         const source = await audio(norsk, "primary");
//         const compiled = await testDocument();
//         result = await go(norsk, compiled);
//         const mixer = result.components['audio-mixer'] as AudioMixer;
//         mixer.subscribe([new StudioNodeSubscriptionSource(source, UnusedSourceDescription, { type: "take-first-stream", select: Audio })]);
//         await waitForCondition(() => Object.keys(latestState()?.sources || []).length == 2)
//         sendCommand({
//           type: 'switch-mute-cmd', sourceId: "primary", muted: true, preMuteSliderValue: 0
//         })
//         await assertNodeOutputsAudioFrames(norsk, result, 'audio-mixer').then((_res) => {
//           expect(latestState()?.sources["primary"]?.isMuted).true
//         })
//       })
//     });
//   })
// })
