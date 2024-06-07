import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { assertNodeOutputsVideoFrames } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { VideoTestcardGeneratorSettings } from "../input.videoTestCard/runtime";
import CardInfo from "../input.videoTestCard/info";
import { RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";

async function defaultRuntime(): Promise<RuntimeSystem> {
	const runtime = emptyRuntime();
	await registerAll(runtime);
	return runtime;
}

describe("Video Card", () => {

	async function testDocument() {
		const runtime = await defaultRuntime();
		const yaml = new YamlBuilder()
			.addNode(
				new YamlNodeBuilder<VideoTestcardGeneratorSettings>
					('card',
						CardInfo(RegistrationConsts),
						{
							resolution: { width: 640, height: 360 },
							frameRate: { frames: 25, seconds: 1 },
							pattern: 'black',
							sourceName: 'card'
						} // be nice if this was typed
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
		await assertNodeOutputsVideoFrames(norsk, nodes, 'card');
	})
});
