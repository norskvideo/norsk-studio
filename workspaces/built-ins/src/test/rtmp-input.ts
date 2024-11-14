import { Norsk, requireAV, selectAV } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { TraceSink, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";

import RtmpInfo from "../input.rtmp/info";
import { Av, BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { expect } from "chai";
import { AddressInfo } from 'net';
import { Server } from 'http';
import fetch from "node-fetch";
import express from 'express';
import { RtmpInputEvent, RtmpInputSettings, RtmpInputState } from "../input.rtmp/runtime";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";
import { _videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("RTMP Input", () => {

  function impl(desc: string, cfg: RtmpInputSettings, cb: (d: () => Promise<document.CompiledDocument>, cfg: RtmpInputSettings) => void) {
    async function testDocument() {
      const runtime = await defaultRuntime();
      const yaml = new YamlBuilder()
        .addNode(
          new YamlNodeBuilder<RtmpInputSettings, RtmpInputState, object, RtmpInputEvent>
            ('rtmp',
              RtmpInfo(RegistrationConsts),
              cfg
            ).reify())
        .reify();

      return document.load(__filename, runtime, YAML.stringify(yaml));
    }
    describe(desc, () => {
      cb(testDocument, cfg)
    })
  }

  impl("RTMP Input with one streamid", {
    id: 'rtmp',
    displayName: "rtmp",
    port: 65403,
    appName: 'yolo',
    streamNames: ['first']
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;

    describe("A single source connects with no stream id", () => {
      after(async () => {
        await norsk?.close();
      })
      it("Should output no streams", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });

        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.components['rtmp'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['rtmp'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, RtmpInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

        const av = await _videoAndAudio(norsk!, "source");
        const rtmp = await norsk!.output.rtmp({
          id: "av-srt",
          url: 'rtmp://127.0.0.1:65403/yolo'
        })
        rtmp.subscribe([{ source: av, sourceSelector: selectAV }], requireAV)

        await waitForAssert(
          () => false,
          () => {
            expect(sink.streamCount()).equals(0);
          },
          5000.0,
          10.0
        )
      })
    });

    describe("a single source connects with the wrong stream id", () => {
      after(async () => {
        await norsk?.close();
      })
      it("Should output no streams", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.components['rtmp'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['rtmp'].yaml, { type: 'take-all-streams', select: Av }, RtmpInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])
        const av = await _videoAndAudio(norsk!, "source");
        const rtmp = await norsk!.output.rtmp({
          id: "av-rtmp",
          url: 'rtmp://127.0.0.1:65403/yolo/wrong'
        })
        rtmp.subscribe([{ source: av, sourceSelector: selectAV }], requireAV)
        await waitForAssert(
          () => false,
          () => {
            expect(sink.streamCount()).equals(0);
          },
          5000.0,
          10.0
        )
      })
    })

    describe("a single source connects with the right stream id", () => {
      after(async () => {
        await norsk?.close();
      })
      it("Should output the stream with the right id", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.components['rtmp'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['rtmp'].yaml, { type: 'take-all-streams', select: Av }, RtmpInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])
        const av = await _videoAndAudio(norsk!, "source");
        const rtmp = await norsk!.output.rtmp({
          id: "av-rtmp",
          url: 'rtmp://127.0.0.1:65403/yolo/first'
        })
        rtmp.subscribe([{ source: av, sourceSelector: selectAV }], requireAV)
        await waitForAssert(
          () => sink.streamCount() == 2 && sink.totalMessages() > 25,
          () => {
            expect(sink.streamCount()).equals(2);
            expect(sink.messages.find((m) => m.streamKey.sourceName == 'first')).exist;
          },
          10000.0,
          10.0
        )
      })
    });

    describe("source re-connects with the right id", () => {
      after(async () => {
        await norsk?.close();
      })
      it("Should re-output the stream with the right id", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.components['rtmp'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['rtmp'].yaml, { type: 'take-all-streams', select: Av }, RtmpInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])
        const av = await _videoAndAudio(norsk!, "source");
        const rtmp = await norsk!.output.rtmp({
          id: "av-rtmp1",
          url: 'rtmp://127.0.0.1:65403/yolo/first'
        })
        rtmp.subscribe([{ source: av, sourceSelector: selectAV }], requireAV)

        await waitForCondition(() => sink.streamCount() == 2);
        await rtmp.close();
        await waitForCondition(() => sink.streamCount() == 0);

        const rtmp2 = await norsk!.output.rtmp({
          id: "av-rtmp2",
          url: 'rtmp://127.0.0.1:65403/yolo/first'
        })
        rtmp2.subscribe([{ source: av, sourceSelector: selectAV }], requireAV)
        await waitForAssert(
          () => sink.streamCount() == 2 && sink.totalMessages() > 25,
          () => {
            expect(sink.streamCount()).equals(2);
            expect(sink.messages.find((m) => m.streamKey.sourceName == 'first')).exist;
          },
          10000.0,
          10.0
        )
      })
    });

    impl("RTMP Input with two stream names", {
      id: 'rtmp',
      displayName: 'rtmp',
      port: 65403,
      appName: 'yolo',
      streamNames: ['first', 'second']
    }, (testDocument, _cfg) => {  
      let norsk: Norsk | undefined = undefined;
    
      describe("Both sources connect", () => {
        after(() => {  
          void closeNorsk();
        });
    
        const closeNorsk = async () => {
          await norsk?.close();
        };
    
        it("should be able to select those streams", async () => {
          norsk = await Norsk.connect({ onShutdown: () => { } });
          const compiled = await testDocument();
          const result = await go(norsk, compiled);
          const source = result.components['rtmp'];
          const sink1 = new TraceSink(norsk as Norsk, "sink-1");
          const sink2 = new TraceSink(norsk as Norsk, "sink-2");
          await Promise.all([sink1.initialised, sink2.initialised]);
    
          sink1.subscribe([
            new StudioNodeSubscriptionSource(source, compiled.components['rtmp'].yaml,
              { type: 'take-specific-stream', select: ["audio", "video"], filter: 'first' }, RtmpInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
          ]);
          sink2.subscribe([
            new StudioNodeSubscriptionSource(source, compiled.components['rtmp'].yaml,
              { type: 'take-specific-stream', select: ["audio", "video"], filter: 'second' }, RtmpInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
          ]);
    
          const av = await _videoAndAudio(norsk!, "source");
          const rtmp = await norsk!.output.rtmp({
            id: "av-rtmp1",
            url: 'rtmp://127.0.0.1:65403/yolo/first'
          });
          rtmp.subscribe([{ source: av, sourceSelector: selectAV }], requireAV);
    
          const rtmp2 = await norsk!.output.rtmp({
            id: "av-rtmp2",
            url: 'rtmp://127.0.0.1:65403/yolo/second'
          });
          rtmp2.subscribe([{ source: av, sourceSelector: selectAV }], requireAV);
    
          await waitForAssert(
            () => sink1.streamCount() == 2 && sink1.totalMessages() > 25 && sink2.streamCount() == 2 && sink2.totalMessages() > 25,
            () => {
              expect(sink1.streamCount()).equal(2);
              expect(sink2.streamCount()).equal(2);
              expect(sink1.messages.find((m) => m.streamKey.sourceName == 'first')).exist;
              expect(sink2.messages.find((m) => m.streamKey.sourceName == 'second')).exist;
            },
            10000.0,
            10.0
          );
        });
      });
    });
  });

  describe("RTMP Input api", () => {
    impl("with basic stream management", {
      id: 'rtmp',
      displayName: 'rtmp',
      port: 65403,
      appName: 'yolo',
      streamNames: ['stream1']
    }, (testDocument, _cfg) => {
      let norsk: Norsk | undefined = undefined;
      let app: express.Application;
      let server: Server;
      let port: number;
  
      beforeEach(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        app = express();
        app.use(express.json());
        server = app.listen(0);
        port = (server.address() as AddressInfo).port;
      });
  
      afterEach(async () => {
        await norsk?.close();
        server?.close();
      });
  
      describe("http api", () => {
        it("disconnect/reconnect cycle via HTTP API", async () => {
          const compiled = await testDocument();
          const result = await go(norsk!, compiled, app);
          const rtmpNode = result.components['rtmp'];
          const sink = new TraceSink(norsk as Norsk, "sink");
          await sink.initialised;
  
          const av = await _videoAndAudio(norsk!, "source");
          let rtmp = await norsk!.output.rtmp({
            id: "av-rtmp1",
            url: 'rtmp://127.0.0.1:65403/yolo/stream1'
          });
          rtmp.subscribe([{ source: av, sourceSelector: selectAV }], requireAV);  
          // Wait for initial connection
          await waitForCondition(() => sink.streamCount() === 2);
          expect((result.runtimeState.latest["rtmp"] as RtmpInputState).connectedSources).to.include('stream1');
  
          const disconnectResponse = await fetch(`http://localhost:${port}/${rtmpNode.id}/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streamName: 'stream1' })
          });
          expect(disconnectResponse.status).to.equal(204);
  
          await waitForCondition(() => sink.streamCount() === 0);
          expect((result.runtimeState.latest["rtmp"] as RtmpInputState).connectedSources).to.not.include('stream1');
  
          const reconnectResponse = await fetch(`http://localhost:${port}/${rtmpNode.id}/reconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streamName: 'stream1' })
          });
          expect(reconnectResponse.status).to.equal(204);
  
          rtmp = await norsk!.output.rtmp({
            id: "av-rtmp2",
            url: 'rtmp://127.0.0.1:65403/yolo/stream1'
          });
          rtmp.subscribe([{ source: av, sourceSelector: selectAV }], requireAV);
  
          await waitForCondition(() => sink.streamCount() === 2);
          expect((result.runtimeState.latest["rtmp"] as RtmpInputState).connectedSources).to.include('stream1');
        });
  
        it("handles invalid API requests appropriately", async () => {
          const compiled = await testDocument();
          const result = await go(norsk!, compiled, app);
  
          const missingNameResponse = await fetch(`http://localhost:${port}/${result.components['rtmp'].id}/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          expect(missingNameResponse.status).to.equal(400);
  
          const nonExistentResponse = await fetch(`http://localhost:${port}/${result.components['rtmp'].id}/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streamName: 'stream1' })
          });
          expect(nonExistentResponse.status).to.equal(404);
        });
      });
    });
  })
});