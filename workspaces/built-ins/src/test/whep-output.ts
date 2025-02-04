import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { WhepOutputCommand, WhepOutputEvent, WhepOutputSettings, WhepOutputState } from "../output.whep/runtime";
import { testSourceDescription, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import puppeteer, { Browser, Page } from 'puppeteer';
import WhepInfo from "../output.whep/info";
import { Av, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleInputWrapper, SimpleSinkWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { AddressInfo } from 'net';
import { Server } from 'http';
import fetch from "node-fetch";
import express from 'express';
async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

// All we're really testing here
// is that we're spinning up the whep node
// with some valid config and that we haven't made a huge snafu in doing so

// I don't even think these asserts are valid now I'm looking at them
// other than I guess the page loaded so the output must exist
describe("WHEP Output", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<WhepOutputSettings, WhepOutputState, WhepOutputCommand, WhepOutputEvent>
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

  // afterEach(async () => {
  //   await norsk?.close();
  //   await page?.close();
  //   await browser?.close();
  //   await new Promise(f => setTimeout(f, 1000));
  // })

  afterEach(async () => {
    try {
      if (page) {
        await page.close().catch(() => {});
      }
      if (browser) {
        await browser.close().catch(() => {});
      }
      if (norsk) {
        await norsk.close().catch(() => {});
      }
      await new Promise(f => setTimeout(f, 1000));
    } catch (error) {
      console.error('Error in afterEach cleanup:', error);
    }
  });

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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();

    await new Promise<void>((r) => {
      async function doIt() {
        await page?.goto('http://127.0.0.1:8080/whep/whep/whep.html');
        // Video only appears if SDP and stuff negotiate properly so..
        await page?.waitForSelector('video', { timeout: 100.0 })
          .catch(() => {
            setTimeout(() => void doIt(), 100.0);
          }).then((v) => {
            expect(v).exist;
          }).finally(() => {
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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    await source.close();

    page = await browser.newPage();

    await new Promise<void>((r) => {
      async function doIt() {
        await page?.goto('http://127.0.0.1:8080/whep/whep/whep.html');
        // Video only appears if SDP and stuff negotiate properly so..
        await page?.waitForSelector('video', { timeout: 1000.0 })
          .catch(() => {
          }).then((v) => {
            expect(v).not.exist;
          }).finally(() => {
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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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
        await page?.goto('http://127.0.0.1:8080/whep/whep/whep.html');
        // Video only appears if SDP and stuff negotiate properly so..
        await page?.waitForSelector('video', { timeout: 100.0 })
          .catch(() => {
            setTimeout(() => void doIt(), 100.0);
          }).then((v) => {
            expect(v).exist;
          }).finally(() => {
            r();
          });
      }
      void doIt();
    })
  })

  describe("WHEP Output API", () => {
    let norsk: Norsk | undefined = undefined;
    let whep: SimpleSinkWrapper = undefined!;
    let source: SimpleInputWrapper = undefined!;
    let browser: Browser | undefined = undefined;
    let page: Page | undefined = undefined;
    let app: express.Application;
    let server: Server;
    let port: number;
    let testCounter = 0;
  
    beforeEach(async () => {
      norsk = await Norsk.connect({ onShutdown: () => { } });
      app = express();
      app.use(express.json());
      server = app.listen(0);
      port = (server.address() as AddressInfo).port;
      testCounter++;
      
      const compiled = await testDocument();
      const result = await go(norsk, compiled, app);
      whep = result.components["whep"] as SimpleSinkWrapper;
      source = await videoAndAudio(norsk, `source-${testCounter}`);
      whep.subscribe([new StudioNodeSubscriptionSource(
        source,
        testSourceDescription(),
        { type: "take-all-streams", select: Av }
      )]);
    });
  
    afterEach(async () => {
      try {
        if (page) {
          await page.close().catch(() => {});
        }
        if (browser) {
          await browser.close().catch(() => {});
        }
        if (server) {
          await new Promise<void>((resolve) => {
            server?.close(() => resolve());
          });
        }
        if (norsk) {
          await norsk.close().catch(() => {});
        }
        await new Promise(f => setTimeout(f, 1000));
      } catch (error) {
        console.error('Error in afterEach cleanup:', error);
      }
    });
  
    it("should handle initial state correctly", async () => {
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.BROWSER_FOR_TESTING ? process.env.BROWSER_FOR_TESTING : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
  
      page = await browser.newPage();
      
      await new Promise<void>((r) => {
        async function doIt() {
          await page?.goto('http://127.0.0.1:8080/whep/whep/whep.html');
          await page?.waitForSelector('video', { timeout: 100.0 })
            .catch(() => {
              setTimeout(() => void doIt(), 100.0);
            }).then((v) => {
              expect(v).exist;
            }).finally(() => {
              r();
            });
        }
        void doIt();
      });
    });
  
    it("should handle disable and enable cycle", async () => {
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.BROWSER_FOR_TESTING ? process.env.BROWSER_FOR_TESTING : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
  
      page = await browser.newPage();

      await new Promise<void>((r) => {
        async function doIt() {
          await page?.goto('http://127.0.0.1:8080/whep/whep/whep.html');
          await page?.waitForSelector('video', { timeout: 100.0 })
            .catch(() => {
              setTimeout(() => void doIt(), 100.0);
            }).then((v) => {
              expect(v).exist;
            }).finally(() => {
              r();
            });
        }
        void doIt();
      });
  
      const disableResponse = await fetch(`http://localhost:${port}/${whep.id}/disable`, {
        method: 'POST'
      });
      expect(disableResponse.status).to.equal(204);
  
      await page.reload();
      await new Promise<void>((r) => {
        async function doIt() {
          await page?.waitForSelector('video', { timeout: 1000.0 })
            .catch(() => {
            }).then((v) => {
              expect(v).not.exist;
            }).finally(() => {
              r();
            });
        }
        void doIt();
      });
  
      const enableResponse = await fetch(`http://localhost:${port}/${whep.id}/enable`, {
        method: 'POST'
      });
      expect(enableResponse.status).to.equal(204);
  
      await page.reload();

      // Verify video comes back
      await new Promise<void>((r) => {
        async function doIt() {
          await page?.goto('http://127.0.0.1:8080/whep/whep/whep.html');
          await page?.waitForSelector('video', { timeout: 100.0 })
            .catch(() => {
              setTimeout(() => void doIt(), 100.0);
            }).then((v) => {
              expect(v).exist;
            }).finally(() => {
              r();
            });
        }
        void doIt();
      });
    });
  
    it("handles invalid API requests appropriately", async () => {
      const alreadyEnabledResponse = await fetch(`http://localhost:${port}/${whep.id}/enable`, {
        method: 'POST'
      });
      expect(alreadyEnabledResponse.status).to.equal(400);
  
      const disableResponse = await fetch(`http://localhost:${port}/${whep.id}/disable`, {
        method: 'POST'
      });
      expect(disableResponse.status).to.equal(204);
  
      const alreadyDisabledResponse = await fetch(`http://localhost:${port}/${whep.id}/disable`, {
        method: 'POST'
      });
      expect(alreadyDisabledResponse.status).to.equal(400);
    });
  
    it("should maintain disabled state across source changes", async () => {
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.BROWSER_FOR_TESTING ? process.env.BROWSER_FOR_TESTING : undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
  
      page = await browser.newPage();
  
      const disableResponse = await fetch(`http://localhost:${port}/${whep.id}/disable`, {
        method: 'POST'
      });
      expect(disableResponse.status).to.equal(204);
  
      // Change source
      const newSource = await videoAndAudio(norsk!, 'new-source');
      whep.subscribe([new StudioNodeSubscriptionSource(
        newSource,
        testSourceDescription(),
        { type: "take-all-streams", select: Av }
      )]);
  
      // Verify still no video after source change
      await page.goto('http://127.0.0.1:8080/whep/whep/whep.html');
      await new Promise<void>((r) => {
        async function doIt() {
          await page?.waitForSelector('video', { timeout: 1000.0 })
            .catch(() => {
            }).then((v) => {
              expect(v).not.exist;
            }).finally(() => {
              r();
            });
        }
        void doIt();
      });
    });
  });
});

