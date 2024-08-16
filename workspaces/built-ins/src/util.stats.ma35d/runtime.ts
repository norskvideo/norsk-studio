import { AmdMA35DLoad, Norsk, SinkMediaNode } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';

export type Ma35DStatsOutputSettings = {
  id: string;
  displayName: string,
};

export type Ma35DStatsOutputState = {
  decoder: number[],
  scaler: number[],
  encoder: number[],
}

export type Ma35DStatsOutputEvent = {
  type: 'new-stats',
  decoder: number,
  scaler: number,
  encoder: number,
}

export type Ma35DStatsOutputCommand = object;

export default class Ma35DStatsOutputDefinition implements ServerComponentDefinition<Ma35DStatsOutputSettings, CreatedMediaNode, Ma35DStatsOutputState, Ma35DStatsOutputCommand, Ma35DStatsOutputEvent> {
  async create(norsk: Norsk, cfg: Ma35DStatsOutputSettings, cb: OnCreated<CreatedMediaNode>, runtime: StudioRuntime<Ma35DStatsOutputState, Ma35DStatsOutputEvent>) {
    const node = new Ma35DStatsOutput(norsk, runtime, cfg);
    cb(node);
  }
}

class Ma35DStatsOutput implements CreatedMediaNode {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();
  norsk: Norsk;
  updates: RuntimeUpdates<Ma35DStatsOutputState, Ma35DStatsOutputEvent>;

  cfg: Ma35DStatsOutputSettings;
  node?: SinkMediaNode<string>;

  constructor(norsk: Norsk, { updates, shared }: StudioRuntime<Ma35DStatsOutputState, Ma35DStatsOutputEvent>, cfg: Ma35DStatsOutputSettings) {
    this.id = cfg.id;
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    shared.onAMD35DLoad(this.onLoadDataReceived.bind(this));
  }

  onLoadDataReceived(currentLoad: AmdMA35DLoad) {
    const decoder: number[] = [];
    const scaler: number[] = [];
    const encoder: number[] = [];

    for (const cuLoad of currentLoad.computeUnitLoad) {
      const nameParts = cuLoad.name.split(":");
      if (nameParts[0] == "decoder") {
        decoder.push(cuLoad.load * 100);
      }
      if (nameParts[0] == "scaler") {
        scaler.push(cuLoad.load * 100);
      }
      if (nameParts[0] == "encoder") {
        encoder.push(cuLoad.load * 100);
      }
    }
    this.updates.raiseEvent({
      type: 'new-stats',
      decoder: decoder.reduce((a, b) => a + b) / decoder.length,
      scaler: scaler.reduce((a, b) => a + b) / scaler.length,
      encoder: encoder.reduce((a, b) => a + b) / encoder.length,
    })
  }
}





