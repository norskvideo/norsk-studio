import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { FixedLadderConfig } from "./runtime";
import type { ResolutionName } from "@norskvideo/norsk-studio/lib/extension/common";
import type { StreamKey } from "@norskvideo/norsk-sdk";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";


export default function({
  defineComponent,
  Video
}: Registration) {
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
              key: r,
              display: r,
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
      desc.config.rungs.forEach((r: string, i: number) => {
        result[i] = r;
      });
      return result;
    },
    configForm: {
      global: {
        hardware: HardwareSelection()
      },
      form: {
        rungs: {
          help: "",
          hint: {
            type: 'multiselect',
            options: rungNames.map((rn) => { return { value: rn, display: `h264: ${rn}` } }),
            defaultValue: [
              'h264_1920x1080',
              'h264_1280x720',
              'h264_640x360'
            ]
          }
        }
      }
    }
  });
}

type AddH264<T extends ResolutionName> = `h264_${T}`;
export type RungName = AddH264<ResolutionName>;

export const rungNames: RungName[] =
  ['h264_1920x1080',
    'h264_1280x720',
    'h264_640x360',
    'h264_320x180'
  ];

