import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { expect } from "chai";
import { SrtOutputCommand, SrtOutputEvent, SrtOutputSettings, SrtOutputState } from "../output.srt/runtime";
import { testSourceDescription, videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";
import SrtInfo from "../output.srt/info";
import { Av, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { SimpleSinkWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import fetch from "node-fetch";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("SRT Output", () => {
  async function testDocument() {
    const runtime = await defaultRuntime();
    const yaml = new YamlBuilder()
      .addNode(
        new YamlNodeBuilder<SrtOutputSettings, SrtOutputState, SrtOutputCommand, SrtOutputEvent>
          ('srt',
            SrtInfo(RegistrationConsts),
            {
              port: 65403,
              host: '0.0.0.0',
              mode: 'listener',
              socketOptions: {}
            }
          ).reify())
      .reify();

    return document.load(__filename, runtime, YAML.stringify(yaml));
  }

  let norsk: Norsk | undefined = undefined;
  let app: express.Application;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    server = app.listen(0);
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    try {
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

  it("Should output some frames", async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled, app);
    const srt = result.components["srt"] as SimpleSinkWrapper;
    const source = await videoAndAudio(norsk, 'source');
    const sink = await norsk.input.srt({
      id: 'sink',
      host: '127.0.0.1',
      port: 65403,
      mode: 'caller',
      sourceName: 'sink'
    });

    srt.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      {
        type: "take-all-streams",
        select: Av
      })])

    await waitForAssert(() => sink.outputStreams.length == 2, () => {
      expect(sink.outputStreams.length).equal(2);
    }, 5000, 10)
  });

  it("should handle disable and enable cycle correctly", async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled, app);
    const srt = result.components["srt"] as SimpleSinkWrapper;
    const source = await videoAndAudio(norsk, 'source');
    const sink = await norsk.input.srt({
      id: 'sink',
      host: '127.0.0.1',
      port: 65403,
      mode: 'caller',
      sourceName: 'sink'
    });

    // Set up initial subscription
    srt.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      {
        type: "take-all-streams",
        select: Av
      })])

    // Wait for initial connection
    await waitForAssert(() => sink.outputStreams.length == 2, () => {
      expect(sink.outputStreams.length).equal(2);
    }, 5000, 10);

    // Disable output
    const disableResponse = await fetch(`http://localhost:${port}/${srt.id}/disable`, {
      method: 'POST'
    });
    expect(disableResponse.status).to.equal(204);

    // Wait for streams to be gone
    await waitForAssert(() => sink.outputStreams.length == 0, () => {
      expect(sink.outputStreams.length).equal(0);
    }, 5000, 10);

    // Enable output
    const enableResponse = await fetch(`http://localhost:${port}/${srt.id}/enable`, {
      method: 'POST'
    });
    expect(enableResponse.status).to.equal(204);

    // Verify streams come back
    await waitForAssert(() => sink.outputStreams.length == 2, () => {
      expect(sink.outputStreams.length).equal(2);
    }, 5000, 10);
  });

  it("should maintain disabled state between connections", async () => {
    norsk = await Norsk.connect({ onShutdown: () => { } });
    const compiled = await testDocument();
    const result = await go(norsk, compiled, app);
    const srt = result.components["srt"] as SimpleSinkWrapper;
    const source = await videoAndAudio(norsk, 'source');

    // Disable output first
    const disableResponse = await fetch(`http://localhost:${port}/${srt.id}/disable`, {
      method: 'POST'
    });
    expect(disableResponse.status).to.equal(204);

    const sink = await norsk.input.srt({
      id: 'sink',
      host: '127.0.0.1',
      port: 65403,
      mode: 'caller',
      sourceName: 'sink'
    });

    srt.subscribe([new StudioNodeSubscriptionSource(
      source,
      testSourceDescription(),
      {
        type: "take-all-streams",
        select: Av
      })])

    // Verify no streams connect when disabled
    await new Promise(resolve => setTimeout(resolve, 2000));
    expect(sink.outputStreams.length).equal(0);
    
    // Enable output and verify streams connect
    const enableResponse = await fetch(`http://localhost:${port}/${srt.id}/enable`, {
      method: 'POST'
    });
    expect(enableResponse.status).to.equal(204);

    await waitForAssert(() => sink.outputStreams.length == 2, () => {
      expect(sink.outputStreams.length).equal(2);
    }, 5000, 10);
  });
});