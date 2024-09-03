import { Interval, Norsk, SinkMediaNode, StreamTimestampReportNode, selectAll } from '@norskvideo/norsk-sdk';

import { CreatedMediaNode, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioRuntime, StudioShared } from '@norskvideo/norsk-studio/lib/extension/runtime-types';

export type LatencyStatsOutputSettings = {
  id: string;
  displayName: string,
  startNodeId: string,
  endNodeId: string
};

export type LatencyStatsOutputState = {
  values: number[],
}

export type LatencyStatsOutputEvent = {
  type: 'new-stats',
  value: number,
}

export type LatencyStatsOutputCommand = object;

export default class LatencyStatsOutputDefinition implements ServerComponentDefinition<LatencyStatsOutputSettings, CreatedMediaNode, LatencyStatsOutputState, LatencyStatsOutputCommand, LatencyStatsOutputEvent> {
  async create(norsk: Norsk, cfg: LatencyStatsOutputSettings, cb: OnCreated<CreatedMediaNode>, runtime: StudioRuntime<LatencyStatsOutputState, LatencyStatsOutputCommand, LatencyStatsOutputEvent>) {
    const node = new LatencyStatsOutput(norsk, runtime, cfg);
    cb(node);
  }
}

class LatencyStatsOutput implements CreatedMediaNode {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();
  norsk: Norsk;
  updates: RuntimeUpdates<LatencyStatsOutputState, LatencyStatsOutputCommand, LatencyStatsOutputEvent>;
  shared: StudioShared;

  cfg: LatencyStatsOutputSettings;
  node?: SinkMediaNode<string>;

  sourceTimestamps?: StreamTimestampReportNode;
  sinkTimestamps?: StreamTimestampReportNode;

  latestSourceTimestamp?: Interval;
  latestSinkTimestamp?: Interval;

  created: boolean = false;

  constructor(norsk: Norsk, { updates, shared }: StudioRuntime<LatencyStatsOutputState, LatencyStatsOutputCommand, LatencyStatsOutputEvent>, cfg: LatencyStatsOutputSettings) {
    this.id = cfg.id;
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.shared = shared;
    this.shared.onComponentCreated(this.trySetup.bind(this));
    void this.trySetup();
  }

  async trySetup() {
    if (!this.cfg.endNodeId) return;
    if (!this.cfg.startNodeId) return;
    if (this.created) return;

    const startNode = this.shared.findComponent(this.cfg.startNodeId);
    const endNode = this.shared.findComponent(this.cfg.endNodeId);

    if (!startNode) return;
    if (!endNode) return;

    if (!startNode.relatedMediaNodes.output) return;
    if (!endNode.relatedMediaNodes.output) return;

    this.created = true;

    this.sourceTimestamps = await this.norsk.debug.streamTimestampReport({
      id: `${this.id}-${this.cfg.startNodeId}-timestamps`,
      onTimestamp: async (_k, t) => {
        this.latestSourceTimestamp = t;
        this.tryRegisterLatency();
      }
    })
    this.sourceTimestamps.subscribe(
      startNode.relatedMediaNodes.output.map((o) => {
        return {
          source: o, sourceSelector: selectAll
        }
      })
    )
    this.sinkTimestamps = await this.norsk.debug.streamTimestampReport({
      id: `${this.id}-${this.cfg.endNodeId}-timestamps`,
      onTimestamp: async (_k, t) => {
        this.latestSinkTimestamp = t;
        this.tryRegisterLatency();
      }

    })
    this.sinkTimestamps.subscribe(
      endNode.relatedMediaNodes.output.map((o) => {
        return {
          source: o, sourceSelector: selectAll
        }
      })
    )
  }
  tryRegisterLatency() {
    if (this.latestSinkTimestamp && this.latestSourceTimestamp) {
      const latency = Number(((this.latestSourceTimestamp.n * 1000n) / this.latestSourceTimestamp.d) - ((this.latestSinkTimestamp.n * 1000n) / this.latestSinkTimestamp.d))
      this.updates.raiseEvent({
        type: 'new-stats',
        value: latency
      })

    }
  }


}





