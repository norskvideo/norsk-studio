import { Norsk } from "@norskvideo/norsk-sdk";
import { YamlBuilder, YamlNodeBuilder } from "norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go, { RunResult } from '@norskvideo/norsk-studio/lib/runtime/execution';
import { assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames, waitForAssert } from "norsk-studio/lib/test/_util/sinks";
import { CascadingSwitch, CascadingSwitchConfig, CascadingSwitchState } from "../processor.cascadingSwitch/runtime";
import cascadingInfo from '../processor.cascadingSwitch/info';
import { expect } from "chai";
import { videoAndAudio, testSourceDescription } from "norsk-studio/lib/test/_util/sources";
import { AvInput, TestConfig, extractLibraryFromRuntime, testRuntime } from "norsk-studio/lib/test/_util/runtime";
import Session from "norsk-studio/lib/client/session";
import { Av, RegistrationConsts } from "norsk-studio/lib/extension/client-types";
import { DocumentDescription, NodeDescription } from "norsk-studio/lib/shared/document";
import { StudioNodeSubscriptionSource } from "norsk-studio/lib/extension/runtime-types";
import registerAll from "..";

const CascadingInfo = cascadingInfo(RegistrationConsts);

async function createRuntime() {
	const runtime = await testRuntime();
	await registerAll(runtime);
	return runtime;
}

async function createLibrary() {
	const runtime = await createRuntime();
	return extractLibraryFromRuntime(runtime);
}

describe("Cascading Switch", () => {


	describe("Design time", () => {
		const yaml = new YamlBuilder().reify();
		let session: Session = undefined as unknown as Session;
		const initialConfig: CascadingSwitchConfig = {
			id: "switch",
			displayName: "Switch",
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
			sources: []
		};

		function getSwitch() {
			return session?.description.findNode(initialConfig.id) as unknown as NodeDescription<CascadingSwitchConfig>
		}

		beforeEach(async () => {
			const library = await createLibrary();
			session = new Session(library, new DocumentDescription(library, yaml));

			session.addNode(CascadingInfo.identifier);
			session.finishEditingNode("", { config: initialConfig });
		})

		// Cascading switch hooks various UI events to update its own config
		// so this is testing those things

		describe("Adding the first source", () => {
			beforeEach(async () => {
				const source = session.addNode(AvInput.info.identifier);
				session?.finishEditingNode("", { config: { id: 'source1' } });
				session?.addSubscription(source, getSwitch());
			});

			it("Adds the source to the config", () => {
				expect(getSwitch().config.sources).lengthOf(1);
				expect(getSwitch().config.sources[0]).equals('source1');
			})
		})

		describe("Adding two sources", () => {
			beforeEach(async () => {
				const source1 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source1' } });
				const source2 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source2' } });
				session.addSubscription(source1, getSwitch());
				session.addSubscription(source2, getSwitch());
			});
			it("Adds the sources to the config in order", () => {
				expect(getSwitch().config.sources).lengthOf(2);
				expect(getSwitch().config.sources[0]).equals('source1');
				expect(getSwitch().config.sources[1]).equals('source2');
			})
		})

		describe("Removing a source", () => {
			beforeEach(async () => {
				const source1 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source1' } });
				const source2 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source2' } });
				session.addSubscription(source1, getSwitch());
				session.addSubscription(source2, getSwitch());
				session.removeSubscription(source1.id, getSwitch().id);
			});
			it("Removes the source from config", () => {
				expect(getSwitch().config.sources).lengthOf(1);
				expect(getSwitch().config.sources[0]).equals('source2');
			})
		})

		describe("Source is renamed", () => {
			beforeEach(async () => {
				const source1 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source1' } });
				const source2 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source2' } });
				session.addSubscription(source1, getSwitch());
				session.addSubscription(source2, getSwitch());

				const testConfig = { ...source1.config as TestConfig };
				testConfig.id = 'renamed';
				session.finishEditingNode("source1", { config: testConfig })
			});
			it("Renames the source in place", () => {
				expect(getSwitch().config.sources).lengthOf(2);
				expect(getSwitch().config.sources[0]).equals('renamed');
				expect(getSwitch().config.sources[1]).equals('source2');
			})
		})

		describe("Source is deleted", () => {
			beforeEach(async () => {
				const source1 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source1' } });
				const source2 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source2' } });
				const source3 = session.addNode(AvInput.info.identifier);
				session.finishEditingNode("", { config: { id: 'source3' } });
				session.addSubscription(source1, getSwitch());
				session.addSubscription(source2, getSwitch());
				session.addSubscription(source3, getSwitch());
				session.removeNode("source2");
			});
			it("Removes the source in place", () => {
				expect(getSwitch().config.sources).lengthOf(2);
				expect(getSwitch().config.sources[0]).equals('source1');
				expect(getSwitch().config.sources[1]).equals('source3');
			})
		})

	})

	const config = {
		id: 'foo',
		displayName: 'Foo',
		resolution: { width: 640, height: 360 },
		frameRate: { frames: 25, seconds: 1 },
		sampleRate: 48000,
		channelLayout: 'stereo',
		sources: [
			'primary',
			'backup'
		] as string[]
	} as const;

	describe("Runtime", () => {
		async function testDocument() {
			const runtime = await createRuntime();
			const yaml = new YamlBuilder()
				.addNode(
					new YamlNodeBuilder
						('switch',
							CascadingInfo,
							config
						).reify())
				.reify();

			const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
			return compiled;
		}

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
			return result?.runtimeState.getNodeState('switch') as (CascadingSwitchState | undefined)
		}

		describe("No inputs", () => {
			it("Should output A/V from the fallback source", async () => {
				const compiled = await testDocument();
				norsk = await Norsk.connect({ onShutdown: () => { } });
				result = await go(norsk, compiled);
				const switcher = result.nodes['switch'] as CascadingSwitch;
				await Promise.all([
					assertNodeOutputsAudioFrames(norsk, result, 'switch'),
					assertNodeOutputsVideoFrames(norsk, result, 'switch'),
					waitForAssert(
						() => switcher.activeSource == 'fallback',
						() => expect(switcher.activeSource).equals('fallback'),
						10000.0,
						10.0
					)
				]);
			})
		});
		describe("primary source is active only", () => {
			it("Should output A/V from the primary source", async () => {
				const compiled = await testDocument();
				norsk = await Norsk.connect({ onShutdown: () => { } });

				const source = await videoAndAudio(norsk, "primary");
				result = await go(norsk, compiled);
				const switcher = result.nodes['switch'] as CascadingSwitch;
				switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: 'take-all-streams', select: Av })]);
				await Promise.all([
					assertNodeOutputsAudioFrames(norsk, result, 'switch'),
					assertNodeOutputsVideoFrames(norsk, result, 'switch'),
					waitForAssert(
						() => switcher.activeSource == 'primary',
						() => expect(switcher.activeSource).equals('primary'),
						10000.0,
						10.0
					),
					waitForAssert(
						() => (latestState())?.activeSource == 'primary',
						() => expect(latestState()?.activeSource).equals('primary'),
						10000.0,
						10.0
					)
				]);
			})
		});
		describe("backup source is active only", () => {
			it("Should output A/V from the backup source", async () => {
				norsk = await Norsk.connect({ onShutdown: () => { } });
				const compiled = await testDocument();
				const source = await videoAndAudio(norsk, "backup");
				result = await go(norsk, compiled);
				const switcher = result.nodes['switch'] as CascadingSwitch;
				switcher.subscribe([new StudioNodeSubscriptionSource(source, testSourceDescription(), { type: 'take-all-streams', select: Av })]);
				await Promise.all([
					assertNodeOutputsAudioFrames(norsk, result, 'switch'),
					assertNodeOutputsVideoFrames(norsk, result, 'switch'),
					waitForAssert(
						() => switcher.activeSource == 'backup',
						() => expect(switcher.activeSource).equals('backup'),
						10000.0,
						10.0
					),
					waitForAssert(
						() => (latestState())?.activeSource == 'backup',
						() => expect(latestState()?.activeSource).equals('backup'),
						10000.0,
						10.0
					)
				]);
			})
		});
		describe("primary and backup sources are active", () => {
			it("Should output A/V from the primary source", async () => {
				norsk = await Norsk.connect({ onShutdown: () => { } });
				const compiled = await testDocument();

				const primary = await videoAndAudio(norsk, "primary");
				const backup = await videoAndAudio(norsk, "backup");
				result = await go(norsk, compiled);
				const switcher = result.nodes['switch'] as CascadingSwitch;
				switcher.subscribe([
					new StudioNodeSubscriptionSource(backup, testSourceDescription(), { type: "take-all-streams", select: Av }),
					new StudioNodeSubscriptionSource(primary, testSourceDescription(), { type: "take-all-streams", select: Av }),
				], { requireOneOfEverything: true }) //, (ctx) => ctx.streams.length >= 6);
				await Promise.all([
					assertNodeOutputsAudioFrames(norsk, result, 'switch'),
					assertNodeOutputsVideoFrames(norsk, result, 'switch'),
					waitForAssert(
						() => switcher.activeSource == 'primary',
						() => expect(switcher.activeSource).equals('primary'),
						10000.0,
						10.0
					)
				]);
			})
		});
		describe("Switch from backup to primary", () => {
			it("Should output A/V from the primary source", async () => {
				norsk = await Norsk.connect({ onShutdown: () => { } });
				const compiled = await testDocument();


				const primary = await videoAndAudio(norsk, "primary");
				const backup = await videoAndAudio(norsk, "backup");
				result = await go(norsk, compiled);
				const switcher = result.nodes['switch'] as CascadingSwitch;
				switcher.subscribe([
					new StudioNodeSubscriptionSource(backup, testSourceDescription(), { type: "take-all-streams", select: Av }),
				]) //, (ctx) => ctx.streams.length >= 6);

				await waitForAssert(
					() => switcher.activeSource == 'backup',
					() => expect(switcher.activeSource).equals('backup'),
					10000.0,
					10.0
				)

				switcher.subscribe([
					new StudioNodeSubscriptionSource(backup, testSourceDescription(), { type: "take-all-streams", select: Av }),
					new StudioNodeSubscriptionSource(primary, testSourceDescription(), { type: "take-all-streams", select: Av }),
				]) //, (ctx) => ctx.streams.length >= 6);

				await Promise.all([
					assertNodeOutputsAudioFrames(norsk, result, 'switch'),
					assertNodeOutputsVideoFrames(norsk, result, 'switch'),
					waitForAssert(
						() => switcher.activeSource == 'primary',
						() => expect(switcher.activeSource).equals('primary'),
						10000.0,
						10.0
					)
				]);
			})
		});
	});
});


