import { Norsk, SourceMediaNode, SrtOutputNode, selectAV } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { TraceSink, assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { SrtInputEvent, SrtInputSettings, SrtInputState } from "../input.srt-listener/runtime";

import SrtInfo from "../input.srt-listener/info";
import { BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { expect } from "chai";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";
import { _videoAndAudio } from "@norskvideo/norsk-studio/lib/test/_util/sources";

async function defaultRuntime(): Promise<RuntimeSystem> {
  const runtime = emptyRuntime();
  await registerAll(runtime);
  return runtime;
}

describe("SRT Listener Input", () => {
  function impl(desc: string, cfg: SrtInputSettings, cb: (d: () => Promise<document.CompiledDocument>, cfg: SrtInputSettings) => void) {
    async function testDocument() {
      const runtime = await defaultRuntime();
      const yaml = new YamlBuilder()
        .addNode(
          new YamlNodeBuilder<SrtInputSettings, SrtInputState, object, SrtInputEvent>
            ('srt',
              SrtInfo(RegistrationConsts),
              cfg
            ).reify())
        .reify();

      const compiled = document.load(__filename, runtime, YAML.stringify(yaml));
      return compiled;
    }

    describe(desc, () => {
      cb(testDocument, cfg)
    })
  }

  impl("Permissive SRT Listener with one stream", {
    id: 'srt',
    displayName: 'srt',
    port: 65403,
    ip: '0.0.0.0',
    sourceNames: 'permissive',
    streamIds: ['first'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;

    afterEach(async () => {
      await norsk?.close();
    })


    describe("A single source connects", () => {
      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const av = await _videoAndAudio(norsk!, "source");
        const srt = await norsk!.output.srt({
          id: "av-srt",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt.subscribe([{ source: av, sourceSelector: selectAV }])
      });


      it("Should output frames with that source name", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

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
    })

    describe("A single source connects, disconnects and connects again", () => {
      let srt: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;

      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt = await norsk!.output.srt({
          id: "av-srt",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt.subscribe([{ source: av, sourceSelector: selectAV }])
      });


      it("Should still output frames with that source name", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

        await waitForCondition(() => sink.streamCount() == 2 && sink.totalMessages() > 25, 10000.0);
        await srt!.close();

        srt = await norsk!.output.srt({
          id: "av-srt",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt.subscribe([{ source: av!, sourceSelector: selectAV }])

        await waitForAssert(
          () => sink.streamCount() == 2 && sink.totalMessages() > 50,
          async () => {
            await assertNodeOutputsAudioFrames(norsk as Norsk, result, "srt");
            await assertNodeOutputsVideoFrames(norsk as Norsk, result, "srt");
            expect(sink.streamCount()).equals(2);
            expect(sink.messages.find((m) => m.streamKey.sourceName == 'first')).exist;
          },
          10000.0,
          10.0
        )
      })
    })

    describe("A second source connects", () => {
      let srt1: SrtOutputNode | undefined = undefined;
      let srt2: SrtOutputNode | undefined = undefined;

      let av: SourceMediaNode | undefined = undefined;
      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
        srt2 = await norsk!.output.srt({
          id: "av-srt-2",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt2.subscribe([{ source: av!, sourceSelector: selectAV }])
      });

      it("Should only output frames with the first source name", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

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
    })
  });

  impl("Permissive SRT Listener with two streams", {
    id: 'srt',
    displayName: 'srt',
    port: 65403,
    ip: '0.0.0.0',
    sourceNames: 'permissive',
    streamIds: ['first', 'second'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;

    afterEach(async () => {
      await norsk?.close();
    })


    describe("A single source connects", () => {
      let srt1: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;
      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
      });



      it("Should output frames with the first source name", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

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
    describe("A single source connects with explicit source name", () => {
      let srt1: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;
      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403,
          streamId: 'second'
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
      });


      it("Should output frames with the explicit source name", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

        await waitForAssert(
          () => sink.streamCount() == 2 && sink.totalMessages() > 25,
          () => {
            expect(sink.streamCount()).equals(2);
            expect(sink.messages.find((m) => m.streamKey.sourceName == 'second')).exist;
          },
          10000.0,
          10.0
        )
      })
    });
    describe("A second source connects", () => {
      let srt1: SrtOutputNode | undefined = undefined;
      let srt2: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;

      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
        srt2 = await norsk!.output.srt({
          id: "av-srt-2",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt2.subscribe([{ source: av!, sourceSelector: selectAV }])
      });


      it("Should output frames with both source names", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

        await waitForAssert(
          () => sink.streamCount() == 4 && sink.totalMessages() > 50,
          () => {
            expect(sink.streamCount()).equals(4);
            expect(sink.messages.find((m) => m.streamKey.sourceName == 'first')).exist;
            expect(sink.messages.find((m) => m.streamKey.sourceName == 'second')).exist;
          },
          10000.0,
          10.0
        )
      })
    })
  });

  impl("Restrictive SRT Listener with one streamid", {
    id: 'srt',
    displayName: 'srt',
    port: 65403,
    ip: '0.0.0.0',
    sourceNames: 'strict',
    streamIds: ['first'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;

    afterEach(async () => {
      await norsk?.close();
    })


    describe("A single source connects with no stream id", () => {
      let srt1: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;

      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
      });

      it("Should output no streams", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

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
      let srt1: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;

      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403,
          streamId: 'wrong'
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
      });


      it("Should output no streams", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

        // Just wait 5 seconds
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
      let srt1: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;

      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403,
          streamId: 'first'
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
      });

      it("Should output the stream with the right id", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

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
  });
  impl("Restrictive SRT Listener with two streamids", {
    id: 'srt',
    displayName: 'srt',
    port: 65403,
    ip: '0.0.0.0',
    sourceNames: 'strict',
    streamIds: ['first', 'second'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;

    afterEach(async () => {
      await norsk?.close();
    })


    describe("Both sources connect", () => {
      let srt1: SrtOutputNode | undefined = undefined;
      let srt2: SrtOutputNode | undefined = undefined;
      let av: SourceMediaNode | undefined = undefined;

      before(async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        av = await _videoAndAudio(norsk!, "source");
        srt1 = await norsk!.output.srt({
          id: "av-srt-1",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403,
          streamId: 'first'
        })
        srt1.subscribe([{ source: av!, sourceSelector: selectAV }])
        srt2 = await norsk!.output.srt({
          id: "av-srt-2",
          mode: "caller",
          ip: "127.0.0.1",
          port: 65403,
          streamId: 'second'
        })
        srt2.subscribe([{ source: av!, sourceSelector: selectAV }])
      });


      it("should be able to select those streams", async () => {
        const compiled = await testDocument();
        const result = await go(norsk!, compiled);
        const source = result.components['srt'];
        const sink1 = new TraceSink(norsk as Norsk, "sink-1");
        const sink2 = new TraceSink(norsk as Norsk, "sink-2");
        await Promise.all([sink1.initialised, sink2.initialised]);

        sink1.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-specific-stream', select: ["audio", "video"], filter: 'first' }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])
        sink2.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.components['srt'].yaml, { type: 'take-specific-stream', select: ["audio", "video"], filter: 'second' }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

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
        )
      })
    });
  });
});


