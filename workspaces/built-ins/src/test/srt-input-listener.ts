import { Norsk } from "@norskvideo/norsk-sdk";
import { registerAll } from "../";
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import { YamlBuilder, YamlNodeBuilder, emptyRuntime } from "@norskvideo/norsk-studio/lib/test/_util/builder"
import * as document from '@norskvideo/norsk-studio/lib/runtime/document';
import YAML from 'yaml';
import go from '@norskvideo/norsk-studio/lib/runtime/execution';
import { TraceSink, assertNodeOutputsAudioFrames, assertNodeOutputsVideoFrames, waitForAssert } from "@norskvideo/norsk-studio/lib/test/_util/sinks";
import { SrtInputEvent, SrtInputSettings, SrtInputState } from "../input.srt-listener/runtime";
import { Ffmpeg, ffmpegCommand, srtOutput } from "@norskvideo/norsk-studio/lib/test/_util/ffmpeg";

import SrtInfo from "../input.srt-listener/info";
import { BaseConfig, NodeInfo, RegistrationConsts } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { StudioNodeSubscriptionSource } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import { expect } from "chai";
import { waitForCondition } from "@norskvideo/norsk-studio/lib/shared/util";

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
    port: 5001,
    ip: '0.0.0.0',
    sourceNames: 'permissive',
    streamIds: ['first'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;
    let ffmpeg: Ffmpeg[] = [];

    afterEach(async () => {
      await norsk?.close();
      await Promise.all(ffmpeg.map(async (f) => f.stop()));
    })


    describe("A single source connects", () => {
      before(async () => {
        ffmpeg = [await Ffmpeg.create(ffmpegCommand({
          transport: srtOutput({ port: 5001, mode: 'caller' })
        }))
        ];
      });


      it("Should output frames with that source name", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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
      before(async () => {
        ffmpeg = [await Ffmpeg.create(ffmpegCommand({
          transport: srtOutput({ port: 5001, mode: 'caller' })
        }))
        ];
      });


      it("Should still output frames with that source name", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

        await waitForCondition(() => sink.streamCount() == 2 && sink.totalMessages() > 25, 10000.0);
        await ffmpeg[0].stop();

        ffmpeg = [await Ffmpeg.create(ffmpegCommand({
          transport: srtOutput({ port: 5001, mode: 'caller' })
        }))]

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
      before(async () => {
        ffmpeg = [
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller' })
          })),
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller' })
          })),
        ];
      });

      it("Should only output frames with the first source name", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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
    port: 5001,
    ip: '0.0.0.0',
    sourceNames: 'permissive',
    streamIds: ['first', 'second'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;
    let ffmpeg: Ffmpeg[] = [];

    afterEach(async () => {
      await norsk?.close();
      await Promise.all(ffmpeg.map(async (f) => f.stop()));
    })


    describe("A single source connects", () => {
      before(async () => {
        ffmpeg = [await Ffmpeg.create(ffmpegCommand({
          transport: srtOutput({ port: 5001, mode: 'caller' })
        }))
        ];
      });


      it("Should output frames with the first source name", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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
      before(async () => {
        ffmpeg = [await Ffmpeg.create(ffmpegCommand({
          transport: srtOutput({ port: 5001, mode: 'caller', streamId: 'second' })
        }))
        ];
      });

      it("Should output frames with the explicit source name", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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
      before(async () => {
        ffmpeg = [
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller' })
          })),
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller' })
          })),
        ];
      });


      it("Should output frames with both source names", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])

        await waitForAssert(
          () => sink.streamCount() == 4 && sink.totalMessages() > 25,
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
    port: 5001,
    ip: '0.0.0.0',
    sourceNames: 'strict',
    streamIds: ['first'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;
    let ffmpeg: Ffmpeg[] = [];

    afterEach(async () => {
      await norsk?.close();
      await Promise.all(ffmpeg.map(async (f) => f.stop()));
    })


    describe("A single source connects with no stream id", () => {
      before(async () => {
        ffmpeg = [await Ffmpeg.create(ffmpegCommand({
          transport: srtOutput({ port: 5001, mode: 'caller' })
        }))
        ];
      });

      it("Should output no streams", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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
      before(async () => {
        ffmpeg = [
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller', streamId: 'wrong' })
          })),
        ];
      });

      it("Should output no streams", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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
      before(async () => {
        ffmpeg = [
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller', streamId: 'first' })
          })),
        ];
      });

      it("Should output the stream with the right id", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink = new TraceSink(norsk as Norsk, "sink");
        await sink.initialised;

        sink.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-all-streams', select: ["audio", "video"] }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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
    port: 5001,
    ip: '0.0.0.0',
    sourceNames: 'strict',
    streamIds: ['first', 'second'],
    socketOptions: {}
  }, (testDocument, _cfg) => {

    let norsk: Norsk | undefined = undefined;
    let ffmpeg: Ffmpeg[] = [];

    afterEach(async () => {
      await norsk?.close();
      await Promise.all(ffmpeg.map(async (f) => f.stop()));
    })


    describe("Both sources connect", () => {
      before(async () => {
        ffmpeg = [
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller', streamId: 'first' })
          })),
          await Ffmpeg.create(ffmpegCommand({
            transport: srtOutput({ port: 5001, mode: 'caller', streamId: 'second' })
          }))
        ];
      });


      it("should be able to select those streams", async () => {
        norsk = await Norsk.connect({ onShutdown: () => { } });
        const compiled = await testDocument();
        const result = await go(norsk, compiled);
        const source = result.nodes['srt'];
        const sink1 = new TraceSink(norsk as Norsk, "sink-1");
        const sink2 = new TraceSink(norsk as Norsk, "sink-2");
        await Promise.all([sink1.initialised, sink2.initialised]);

        sink1.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-specific-stream', select: ["audio", "video"], filter: 'first' }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
        ])
        sink2.subscribe([
          new StudioNodeSubscriptionSource(source, compiled.nodes['srt'].yaml, { type: 'take-specific-stream', select: ["audio", "video"], filter: 'second' }, SrtInfo(RegistrationConsts) as unknown as NodeInfo<BaseConfig>)
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


