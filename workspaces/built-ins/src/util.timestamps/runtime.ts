import { Interval, Norsk, SinkMediaNode, StreamKey } from '@norskvideo/norsk-sdk';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SimpleSinkWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

export type TimestampOutputSettings = {
  id: string;
  displayName: string,
};

export type TimestampCollection = {
  key: string,
  timestamps: { ts: number, wall: number }[],
  startTimestamp: number,
  startTimeMs: number
}

export type TimestampOutputState = {
  timestamps: TimestampCollection[]
}

export type TimestampOutputEvent = {
  type: 'new-timestamp',
  key: string,
  value: number
  wallMs: number
}

export type TimestampOutputCommand = object;

// This should really be achieved with an image writer
// but I had a quick look and I'd need to write rust, erlang, purescript, and typescript
// to surface this functionality
export default class TimestampOutputDefinition implements ServerComponentDefinition<TimestampOutputSettings, SimpleSinkWrapper, TimestampOutputState, TimestampOutputCommand, TimestampOutputEvent> {
  async create(norsk: Norsk, cfg: TimestampOutputSettings, cb: OnCreated<SimpleSinkWrapper>, runtime: StudioRuntime<TimestampOutputState, TimestampOutputCommand, TimestampOutputEvent>) {
    const node = new TimestampOutput(norsk, runtime, cfg);
    await node.initialised;
    cb(node);
  }
}

class TimestampOutput extends CustomSinkNode {
  initialised: Promise<void>;
  norsk: Norsk;
  updates: RuntimeUpdates<TimestampOutputState, TimestampOutputCommand, TimestampOutputEvent>;

  cfg: TimestampOutputSettings;
  node?: SinkMediaNode<string>;

  constructor(norsk: Norsk, { updates }: StudioRuntime<TimestampOutputState, TimestampOutputCommand, TimestampOutputEvent>, cfg: TimestampOutputSettings) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
  }

  async initialise() {
    const node = await this.norsk.debug.streamTimestampReport({
      onTimestamp: this.onTimestamp.bind(this)
    })
    this.setup({ sink: node })
  }

  async onTimestamp(key: StreamKey, timestamp: Interval) {
    this.updates.raiseEvent({
      type: 'new-timestamp',
      key: `${key.programNumber}-${key.sourceName}-${key.streamId}-${key.renditionName}`,
      value: Number((timestamp.n * 100n) / timestamp.d) / 100,
      wallMs: new Date().valueOf()
    })
  }
}





