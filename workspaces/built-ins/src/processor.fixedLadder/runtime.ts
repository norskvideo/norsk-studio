import { AmdMA35DH264, AmdMA35DHevc, Norsk, NvidiaH264, QuadraH264, VideoEncodeRung, X264Codec } from '@norskvideo/norsk-sdk';

import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { RungName } from './info';
import { HardwareAccelerationType } from '@norskvideo/norsk-studio/lib/shared/config';

export type FixedLadderConfig = {
  __global: {
    hardware?: HardwareAccelerationType,
  },
  id: string,
  displayName: string,
  rungs: RungName[]
}


export default class FixedLadderDefinition implements ServerComponentDefinition<FixedLadderConfig, SimpleProcessorWrapper> {
  async create(norsk: Norsk, cfg: FixedLadderConfig, cb: OnCreated<SimpleProcessorWrapper>) {
    const wrapper = new SimpleProcessorWrapper(cfg.id, async () => {
      return await norsk.processor.transform.videoEncode({
        id: `${cfg.id}-ladder`,
        rungs: cfg.rungs.map((r) => createRung(r, cfg.__global.hardware))
      });
    });
    await wrapper.initialised;
    cb(wrapper);

  }
}

// Or whatever
function createRung(rung: RungName, hardware?: HardwareAccelerationType) {
  switch (hardware) {
    case undefined:
      switch (rung) {
        case 'h264_1920x1080':
          return createRungImpl({ name: rung, threads: 8, bitrate: 5_000 });
        case 'h264_1280x720':
          return createRungImpl({ name: rung, threads: 4, bitrate: 2_500 });
        case 'h264_640x360':
          return createRungImpl({ name: rung, threads: 2, bitrate: 1_000 });
        case 'h264_320x180':
          return createRungImpl({ name: rung, threads: 1, bitrate: 800 });
        default:
          return assertUnreachable(rung);
      }
    case "ma35d":
      switch (rung) {
        case 'h264_1920x1080':
          return createMa35DHevcRungImpl({ name: rung, bitrate: 10_000 });
        case 'h264_1280x720':
          return createMa35DH264RungImpl({ name: rung, bitrate: 5_000 });
        case 'h264_640x360':
          return createMa35DH264RungImpl({ name: rung, bitrate: 2_000 });
        case 'h264_320x180':
          return createMa35DH264RungImpl({ name: rung, bitrate: 1_000 });
        default:
          return assertUnreachable(rung);
      }
    case 'logan':
      throw new Error("Logan not supported, just for show");
    case 'nvidia':
      switch (rung) {
        case 'h264_1920x1080':
          return createNvidiaRungImpl({ name: rung, bitrate: 5_000_000 });
        case 'h264_1280x720':
          return createNvidiaRungImpl({ name: rung, bitrate: 2_500_000 });
        case 'h264_640x360':
          return createNvidiaRungImpl({ name: rung, bitrate: 1_000_000 });
        case 'h264_320x180':
          return createNvidiaRungImpl({ name: rung, bitrate: 800_000 });
        default:
          return assertUnreachable(rung);
      }
    case 'quadra':
      switch (rung) {
        case 'h264_1920x1080':
          return createQuadraRungImpl({ name: rung, bitrate: 5_000_000 });
        case 'h264_1280x720':
          return createQuadraRungImpl({ name: rung, bitrate: 2_500_000 });
        case 'h264_640x360':
          return createQuadraRungImpl({ name: rung, bitrate: 1_000_000 });
        case 'h264_320x180':
          return createQuadraRungImpl({ name: rung, bitrate: 800_000 });
        default:
          return assertUnreachable(rung);
      }
    default:
      return assertUnreachable(hardware);
  }
}

function rungWidth(rungName: string): number {
  return parseInt(rungName.split('_')[1].split(`x`)[0]);
}

function rungHeight(rungName: string): number {
  return parseInt(rungName.split('_')[1].split(`x`)[1]);
}


type RungConfig = {
  name: RungName,
  bitrate: number,
  threads: number,
}

function createRungImpl({ name, threads, bitrate }: RungConfig): VideoEncodeRung {
  const codec: X264Codec = {
    type: "x264",
    bitrateMode: { value: bitrate, mode: "abr" },
    keyFrameIntervalMax: 50,
    keyFrameIntervalMin: 50,
    sceneCut: 0,
    preset: "fast",
    tune: "zerolatency",
    threads,
    bframes: 0,
  };
  return {
    name,
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

type MA35DRungConfig = {
  name: RungName,
  bitrate: number,
}
function createMa35DHevcRungImpl({ name, bitrate }: MA35DRungConfig): VideoEncodeRung {
  const codec: AmdMA35DHevc = {
    type: "amdMA35D-hevc",
    profile: "main",
    rateControl: { mode: "cbr", bitrate: bitrate },
    gopSize: 50,
  };
  return {
    name,
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

function createMa35DH264RungImpl({ name, bitrate }: MA35DRungConfig): VideoEncodeRung {
  const codec: AmdMA35DH264 = {
    type: "amdMA35D-h264",
    profile: "main",
    rateControl: { mode: "cbr", bitrate: bitrate },
    gopSize: 50,
  };
  return {
    name,
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

type QuadraRungConfig = {
  name: RungName,
  bitrate: number,
}
function createQuadraRungImpl({ name, bitrate }: QuadraRungConfig): VideoEncodeRung {
  const codec: QuadraH264 = {
    type: "quadra-h264",
    intraPeriod: 50,
    bitrate
  };
  return {
    name,
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

type NvidiaRungConfig = {
  name: RungName,
  bitrate: number,
}

function createNvidiaRungImpl({ name, bitrate }: NvidiaRungConfig): VideoEncodeRung {
  const codec: NvidiaH264 = {
    type: "nv-h264",
    idrPeriod: 50,
    rateControl: {
      mode: 'vbr',
      averageBitrate: bitrate
    }
  };
  return {
    name,
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}
