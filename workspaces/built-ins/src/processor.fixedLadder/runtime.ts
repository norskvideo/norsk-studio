import { AmdMA35DH264, AmdMA35DHevc, LoganH264, LoganHevc, Norsk, NvidiaH264, NvidiaHevc, QuadraH264, QuadraHevc, VideoEncodeRung, X264Codec, X265Codec } from '@norskvideo/norsk-sdk';

import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { HardwareAccelerationType } from '@norskvideo/norsk-studio/lib/shared/config';
import { warninglog } from '@norskvideo/norsk-studio/lib/server/logging';

export type FixedLadderConfig = {
  __global: {
    hardware?: HardwareAccelerationType,
  }
  id: string,
  displayName: string,
  notes?: string
  rungs: LadderRungDefinition[]
}

export type SoftwareLadderRung = { codec: X264Codec | X265Codec } & Omit<VideoEncodeRung, "codec" | "name">
export type Ma35dLadderRung = { codec: AmdMA35DH264 | AmdMA35DHevc } & Omit<VideoEncodeRung, "codec" | "name">
export type LoganLadderRung = { codec: LoganH264 | LoganHevc } & Omit<VideoEncodeRung, "codec" | "name">
export type NvidiaLadderRung = { codec: NvidiaH264 | NvidiaHevc } & Omit<VideoEncodeRung, "codec" | "name">
export type QuadraLadderRung = { codec: QuadraH264 | QuadraHevc } & Omit<VideoEncodeRung, "codec" | "name">

export type LadderRungDefinition = {
  name: string,
  software?: SoftwareLadderRung,
  ma35d?: Ma35dLadderRung,
  logan?: LoganLadderRung,
  nvidia?: NvidiaLadderRung,
  quadra?: QuadraLadderRung
}

export default class FixedLadderDefinition implements ServerComponentDefinition<FixedLadderConfig, SimpleProcessorWrapper> {
  async create(norsk: Norsk, cfg: FixedLadderConfig, cb: OnCreated<SimpleProcessorWrapper>) {
    const wrapper = new SimpleProcessorWrapper(cfg.id, async () => {
      return await norsk.processor.transform.videoEncode({
        id: `${cfg.id}-ladder`,
        rungs: cfg.rungs
          .map((r) => createRung(r, cfg.__global.hardware))
          .filter((x): x is VideoEncodeRung => !!x)
      });
    });
    await wrapper.initialised;
    cb(wrapper);

  }
}

// Or whatever
function createRung(rung: LadderRungDefinition, hardware?: HardwareAccelerationType) {
  if (hardware) {
    return createHardwareRung(rung, hardware);
  } else {
    return createSoftwareRung(rung);
  }
}

function createHardwareRung(rung: LadderRungDefinition, hardware: HardwareAccelerationType): VideoEncodeRung | undefined {
  const actualRung = rung[hardware];
  if (!actualRung) {
    warninglog("Hardware rung isn't defined, attempting software", { name: rung.name })
    return createSoftwareRung(rung);
  }
  return { name: rung.name, ...actualRung };
}

function createSoftwareRung(rung: LadderRungDefinition) {
  const actualRung = rung['software'];
  if (!actualRung) {
    warninglog("Software rung isn't defined, ignoring", { name: rung.name })
    return undefined;
  }
  return { name: rung.name, ...actualRung };
}

