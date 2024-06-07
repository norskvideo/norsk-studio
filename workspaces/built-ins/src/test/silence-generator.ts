import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { assertNodeOutputsAudioFrames } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { SilenceConfig } from "../input.silence/runtime";
import SilenceInfo from "../input.silence/info";
import { RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";

async function defaultRuntime(): Promise<RuntimeSystem> {
	const runtime = emptyRuntime();
	await registerAll(runtime);
	return runtime;
}

describe("Silence Generator", () => {
	async function testDocument() {
		const runtime = await defaultRuntime();
		const yaml = new YamlBuilder()
			.addNode(
				new YamlNodeBuilder<SilenceConfig>
					('silence',
						SilenceInfo(RegistrationConsts),
						{
							sampleRate: 48000, channelLayout: 'stereo'
						}
					).reify())
			.reify();

		const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
		return compiled;
	}
	let norsk: Norsk | undefined = undefined;

	after(async () => {
		await norsk?.close();
	})

	it("Should output some frames", async () => {
		norsk = await Norsk.connect({ onShutdown: () => { } });
		const compiled = await testDocument();
		const nodes = await go(norsk, compiled);
		await assertNodeOutputsAudioFrames(norsk, nodes, 'silence');
	})





});
