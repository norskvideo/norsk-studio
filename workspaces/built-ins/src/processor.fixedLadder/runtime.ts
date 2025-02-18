import { OnCreated, ServerComponentDefinition } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { SimpleProcessorWrapper } from "@norskvideo/norsk-studio/lib/extension/base-nodes";
import { HardwareAccelerationType } from '@norskvideo/norsk-studio/lib/shared/config';
import { warninglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { components } from './types';
import { Norsk, VideoEncodeRung } from '@norskvideo/norsk-sdk';
import path from 'path';
import fs from 'fs/promises';
import YAML from 'yaml';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';

export type SoftwareLadderRung = components['schemas']['softwareLadderRung'];
export type Ma35dLadderRung = components['schemas']['ma35dLadderRung'];
export type LoganLadderRung = components['schemas']['loganLadderRung'];
export type NvidiaLadderRung = components['schemas']['nvidiaLadderRung'];
export type QuadraLadderRung = components['schemas']['quadraLadderRung'];
export type LadderRungDefinition = components['schemas']['ladderRungDefinition'];


type HardwareType = Extract<HardwareAccelerationType, "quadra" | "logan" | "nvidia" | "ma35d"> | "software";

export type FixedLadderConfig = Omit<components["schemas"]["fixedLadderConfig"], "__global"> & {
  __global: {
    hardware?: HardwareType
  }
};

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


  async schemas() {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
    return {
      config: resolved.components!.schemas!['fixedLadderConfig']
    }
  }
}

function createRung(rung: LadderRungDefinition, hardware?: HardwareType) {
  if (hardware && hardware !== 'software') {
    return createHardwareRung(rung, hardware);
  } else {
    return createSoftwareRung(rung);
  }
}

function createHardwareRung(rung: LadderRungDefinition, hardware: Exclude<HardwareType, "software">): VideoEncodeRung | undefined {
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

