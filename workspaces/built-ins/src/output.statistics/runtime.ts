import { MultiStreamStatistics, Norsk } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

export type StatisticsOutputSettings = {
  id: string;
  displayName: string,
};

export type StatisticsOutputState = {
  previous?: MultiStreamStatistics;
};

export type StatisticsOutputEvent = {
  type: 'summary',
  summary: MultiStreamStatistics
};


export type StatisticsOutputCommand = object;

export default class StatisticsOutputDefinition implements ServerComponentDefinition<StatisticsOutputSettings, SimpleSinkWrapper, StatisticsOutputState, StatisticsOutputCommand, StatisticsOutputEvent> {
  async create(norsk: Norsk, cfg: StatisticsOutputSettings, cb: OnCreated<SimpleSinkWrapper>, { updates }: StudioRuntime<StatisticsOutputState, StatisticsOutputCommand, StatisticsOutputEvent>) {
    const node = new StatisticsOutput(norsk, updates, cfg);
    await node.initialised;
    cb(node);
  }
}

class StatisticsOutput extends CustomSinkNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<StatisticsOutputState, StatisticsOutputCommand, StatisticsOutputEvent>;

  cfg: StatisticsOutputSettings;

  constructor(norsk: Norsk, updates: RuntimeUpdates<StatisticsOutputState, StatisticsOutputCommand, StatisticsOutputEvent>, cfg: StatisticsOutputSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
  }

  async initialise() {
    const node = await this.norsk.processor.control.streamStatistics({
      onStreamStatistics: (stats: MultiStreamStatistics) => {
        this.updates.raiseEvent({
          type: 'summary',
          summary: stats
        })
      }
    });
    this.setup({ sink: node });
  }
}
