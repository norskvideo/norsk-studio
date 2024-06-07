import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { WhepOutputSettings } from "../output.whep/runtime";
import { testSourceDescription, videoAndAudio } from "norsk-studio/lib/test/_util/sources";
import puppeteer, { Browser, Page } from 'puppeteer';
import WhepInfo from "../output.whep/info";
import { Av, RegistrationConsts } from "norsk-studio/lib/extension/client-types";
import { SimpleSinkWrapper } from "norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "norsk-studio/lib/extension/runtime-types";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

// All we're really testing here
// is that we're spinning up the whep node
// with some valid config and that we haven't made a huge snafu in doing so
describe("WHEP Output", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<WhepOutputSettings>
          ('whep',
            WhepInfo(RegistrationConsts),
            {}
          ).reify())
      .reify();

    const compiled = document.load(__filename, runtime, YAML.stringify(yaml), { resolveConfig: true });
    return compiled;
  }

  let norsk: Norsk | undefined = undefined;
  let browser: Browser | undefined = undefined;
  let page: Page | undefined = undefined;

  after(async () => {
    await norsk?.close();
    await page?.close();
    await browser?.close();
  })

  before(async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled);
    const whep = result.nodes["whep"] as SimpleSinkWrapper;
    const source = await videoAndAudio(norsk, 'source');
    whep.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-all-streams", select: Av }
    )])
  })


  it("Should be running a WHEP output", async () => {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.BROWSER_FOR_TESTING ? process.env.BROWSER_FOR_TESTING : undefined,
    });

    page = await browser.newPage();

    await new Promise<void>((r) => {
      async function doIt() {
        await page?.goto('http://localhost:8080/whep/whep/whep.html');
        // Video only appears if SDP and stuff negotiate properly so..
        await page?.waitForSelector('video', { timeout: 100.0 })
          .catch(() => {
            setTimeout(doIt, 100.0);
          }).then((v) => {
            expect(v).exist;
            r();
          });
      }
      void doIt();
    })
  })
});

