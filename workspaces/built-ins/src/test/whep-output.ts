import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { WhepOutputSettings } from "../output.whep/runtime";
import { testSourceDescription, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import puppeteer, { Browser, Page } from 'puppeteer';
import WhepInfo from "../output.whep/info";
import { Av, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleInputWrapper, SimpleSinkWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";

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
  let whep: SimpleSinkWrapper = undefined!;
  let source: SimpleInputWrapper = undefined!;

  afterEach(async () => {
    await norsk?.close();
    await page?.close();
    await browser?.close();
  })

  beforeEach(async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled);
    whep = result.components["whep"] as SimpleSinkWrapper;
    source = await videoAndAudio(norsk, 'source');
    whep.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-all-streams", select: Av }
    )])
  })


  it("With a source", async () => {
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

  it("Without a source", async () => {
    whep.subscribe([])
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.BROWSER_FOR_TESTING ? process.env.BROWSER_FOR_TESTING : undefined,
    });

    await source.close();

    page = await browser.newPage();

    await new Promise<void>((r) => {
      async function doIt() {
        await page?.goto('http://localhost:8080/whep/whep/whep.html');
        // Video only appears if SDP and stuff negotiate properly so..
        await page?.waitForSelector('video', { timeout: 1000.0 })
          .catch(() => {

          }).then((v) => {
            expect(v).not.exist;
            r();
          });
      }
      void doIt();
    })
  })

  it("With a changing source", async () => {
    whep.subscribe([])
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.BROWSER_FOR_TESTING ? process.env.BROWSER_FOR_TESTING : undefined,
    });

    await source.close();
    source = await videoAndAudio(norsk!, 'source');

    whep.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      { type: "take-all-streams", select: Av }
    )])

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

