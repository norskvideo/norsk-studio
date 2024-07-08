import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import React, { LazyExoticComponent } from 'react';
import type { FixedLadderConfig, LadderRungDefinition, LoganLadderRung, Ma35dLadderRung, NvidiaLadderRung, QuadraLadderRung, SoftwareLadderRung } from "./runtime";
import type { ResolutionName } from "@norskvideo/norsk-studio/lib/extension/common";
import type { AmdMA35DH264, AmdMA35DHevc, LoganH264, NvidiaH264, QuadraH264, StreamKey, X264Codec } from "@norskvideo/norsk-sdk";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";
import type { CustomEditorProps, FormEntry, FormHint, FormHintSingle, NewForm } from "@norskvideo/norsk-studio/lib/extension/client-types";


export default function({
  defineComponent,
  Video
}: Registration) {
  const RungView = React.lazy(async () => import('./rung-view'))
  const CodecEditor = React.lazy(async () => import('./codec-editor'))
  const CodecView = React.lazy(async () => import('./codec-view'))
  return defineComponent<FixedLadderConfig>({
    identifier: 'processor.transform.fixedLadder',
    category: 'processor',
    name: "Encode Ladder",
    subscription: {
      // Only accept a single video stream
      accepts: {
        type: 'single-stream',
        media: Video
      },
      produces: {
        possibleMedia: Video,
        type: "fixed-list",
        keys: (cfg) => {
          return cfg.rungs.map((r) => {
            return {
              key: r.name,
              display: r.name,
              media: Video
            }
          })
        },
        selector: (selection, metadata) => {
          return metadata.filter((s) => s.streamKey && selection.includes(s.streamKey?.renditionName))
            .map((r) => r.streamKey)
            .filter((r): r is StreamKey => !!r)
        },
      }
    },
    extraValidation: function(ctx) {
      ctx.requireVideo(1);
    },
    display: (desc) => {
      const result: { [k: string]: string } = {};
      desc.config.rungs.forEach((r, i: number) => {
        result[i] = r.name;
      });
      return result;
    },
    configForm: {
      global: {
        hardware: HardwareSelection()
      },
      form: {
        rungs: {
          help: "The rungs in this encode ladder",
          hint: {
            type: 'form-list',
            envOverride: true,
            newForm: {
              form: {
                name: {
                  help: "Unique name of the ladder rung (used in outputs)",
                  hint: {
                    type: "text",
                    defaultValue: 'default'
                  }
                },
                width: {
                  help: 'Width in pixels of this rung',
                  hint: {
                    type: 'numeric',
                    defaultValue: 640,
                  }
                },
                height: {
                  help: 'Width in pixels of this rung',
                  hint: {
                    type: 'numeric',
                    defaultValue: 360,
                  }
                },
              }, transform: (x: { name: string, width: number, height: number }) => ({
                name: x.name,
                software: createRungImpl({ name: `hack_${x.width}x${x.height}`, bitrate: 5_000, threads: 4 }),
                quadra: createQuadraRungImpl({ name: `hack_${x.width}x${x.height}`, bitrate: 5_000_000 }),
                logan: createLoganRungImpl({ name: `hack_${x.width}x${x.height}`, bitrate: 5_000_000 }),
                nvidia: createNvidiaRungImpl({ name: `hack_${x.width}x${x.height}`, bitrate: 5_000_000 }),
                ma35d: createMa35DH264RungImpl({ name: `hack_${x.width}x${x.height}`, bitrate: 5_000_000 }),
              })
            } as NewForm<unknown, LadderRungDefinition>,
            form: {
              name: {
                help: "Unique name of the ladder rung (used in outputs)",
                hint: {
                  type: "text",
                  defaultValue: 'default'
                }
              },
              software: rungEditorForm('software'),
              quadra: rungEditorForm('quadra'),
              logan: rungEditorForm('logan'),
              nvidia: rungEditorForm('nvidia'),
              ma35d: rungEditorForm('ma35d'),
            },
            view: RungView,
            defaultValue: rungNames.map((n) => {
              return {
                name: n,
                software: createSoftwareRung(n),
                quadra: createQuadraRung(n),
                logan: createLoganRung(n),
                nvidia: createNvidiaRung(n),
                ma35d: createMa35dRung(n)
              }
            })

          }
        }
      }
    }
  });


  // TODO: Unpick these types
  // probably just remove the lazy requirement from our react components
  function rungEditorForm<Codec>(mode: string): FormEntry<LadderRungDefinition, { width: number, height: number, codec: Codec } | undefined> {
    const codecHint: FormHintSingle<{ width: number, height: number, codec: Codec }, Codec> = {
      type: 'custom',
      component: CodecEditor as LazyExoticComponent<(p: CustomEditorProps<{ width: number, height: number, codec: Codec }, Codec>) => JSX.Element>
    };
    return {
      help: `Settings to use when encoding using ${mode} mode`,
      hint: {
        type: 'form-item',
        view: CodecView,
        form: {
          width: {
            help: 'Width in pixels of this rung',
            hint: {
              type: 'numeric',
              defaultValue: 640,
            }
          },
          height: {
            help: 'Width in pixels of this rung',
            hint: {
              type: 'numeric',
              defaultValue: 360,
            }
          },
          codec: {
            help: "Codec settings for this rung",
            hint: codecHint as FormHint<{ width: number, height: number, codec: Codec }, Codec>
          }
        }
      }
    }
  }
}


type AddH264<T extends ResolutionName> = `h264_${T}`;
export type RungName = AddH264<ResolutionName>;

export const rungNames: RungName[] =
  ['h264_1920x1080',
    'h264_1280x720',
    'h264_640x360',
    'h264_320x180'
  ];

export function createSoftwareRung(rung: RungName) {
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
}

export function createMa35dRung(rung: RungName) {
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
}

export function createNvidiaRung(rung: RungName) {
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
}

export function createQuadraRung(rung: RungName) {
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
}

export function createLoganRung(rung: RungName) {
  switch (rung) {
    case 'h264_1920x1080':
      return createLoganRungImpl({ name: rung, bitrate: 5_000_000 });
    case 'h264_1280x720':
      return createLoganRungImpl({ name: rung, bitrate: 2_500_000 });
    case 'h264_640x360':
      return createLoganRungImpl({ name: rung, bitrate: 1_000_000 });
    case 'h264_320x180':
      return createLoganRungImpl({ name: rung, bitrate: 800_000 });
    default:
      return assertUnreachable(rung);
  }
}

function createRungImpl({ name, threads, bitrate }: RungConfig): SoftwareLadderRung {
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
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

type MA35DRungConfig = {
  name: string,
  bitrate: number,
}

function createMa35DHevcRungImpl({ name, bitrate }: MA35DRungConfig): Ma35dLadderRung {
  const codec: AmdMA35DHevc = {
    type: "amdMA35D-hevc",
    profile: "main",
    rateControl: { mode: "cbr", bitrate: bitrate },
    gopSize: 50,
  };
  return {
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

function createMa35DH264RungImpl({ name, bitrate }: MA35DRungConfig): Ma35dLadderRung {
  const codec: AmdMA35DH264 = {
    type: "amdMA35D-h264",
    profile: "main",
    rateControl: { mode: "cbr", bitrate: bitrate },
    gopSize: 50,
  };
  return {
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

type QuadraRungConfig = {
  name: string,
  bitrate: number,
}

function createQuadraRungImpl({ name, bitrate }: QuadraRungConfig): QuadraLadderRung {
  const codec: QuadraH264 = {
    type: "quadra-h264",
    intraPeriod: 50,
    bitrate
  };
  return {
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

function createLoganRungImpl({ name, bitrate }: QuadraRungConfig): LoganLadderRung {
  const codec: LoganH264 = {
    type: "logan-h264",
    intraPeriod: 50,
    bitrate
  };
  return {
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

type NvidiaRungConfig = {
  name: string,
  bitrate: number,
}

function createNvidiaRungImpl({ name, bitrate }: NvidiaRungConfig): NvidiaLadderRung {
  const codec: NvidiaH264 = {
    type: "nv-h264",
    idrPeriod: 50,
    rateControl: {
      mode: 'vbr',
      averageBitrate: bitrate
    }
  };
  return {
    width: rungWidth(name),
    height: rungHeight(name),
    codec,
    frameRate: { frames: 25, seconds: 1 },
  }
}

function rungWidth(rungName: string): number {
  return parseInt(rungName.split('_')[1].split(`x`)[0]);
}

function rungHeight(rungName: string): number {
  return parseInt(rungName.split('_')[1].split(`x`)[1]);
}


type RungConfig = {
  name: string,
  bitrate: number,
  threads: number,
}


function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
