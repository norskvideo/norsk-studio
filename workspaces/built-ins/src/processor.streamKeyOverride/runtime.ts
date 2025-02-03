import { Norsk, StreamKey, StreamKeyOverrideNode, StreamMetadataMessage, SubscribeDestination, SubscriptionError, streamKeysAreEqual } from '@norskvideo/norsk-sdk';

import { ActiveStream, CreatedMediaNode, OnCreated, RelatedMediaNodes, ServerComponentDefinition, StudioNodeSubscriptionSource } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { NodeDescriptionId } from '@norskvideo/norsk-studio/lib/shared/document';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';

export type StreamKeyOverrideConfig = {
  id: string,
  displayName: string,

  mode: "simple" | "by-media-type" | "in-order",
  output: "merged" | "individually-selectable",

  sourceName?: string,
  programNumber?: number,
  streamId?: number,
  renditionName?: string,
  notes?: string,
}

export default class StreamKeyOverrideDefinition implements ServerComponentDefinition<StreamKeyOverrideConfig, StreamKeyOverride> {
  async create(norsk: Norsk, cfg: StreamKeyOverrideConfig, cb: OnCreated<StreamKeyOverride>) {
    const node = await StreamKeyOverride.create(norsk, cfg);
    cb(node);
  }
}


type Mapping = { from: ActiveStream, to: StreamKey, node?: StreamKeyOverrideNode, nodeDescriptionId: NodeDescriptionId };
type Diff = { added: Mapping[], removed: Mapping[], unchanged: Mapping[] };
type History = { sourceName: string, programNumber: number, lastStreamId: number }[];

export class StreamKeyOverride implements CreatedMediaNode, SubscribeDestination {
  static uid = 0;
  norsk: Norsk;
  mapping: Mapping[] = [];
  history: History = [];

  currentSources: StudioNodeSubscriptionSource[] = [];
  cfg: StreamKeyOverrideConfig;
  initialised: Promise<void>;
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  static async create(norsk: Norsk, cfg: StreamKeyOverrideConfig) {
    const node = new StreamKeyOverride(norsk, cfg);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: StreamKeyOverrideConfig) {
    this.id = cfg.id;
    this.cfg = cfg;
    this.norsk = norsk;
    this.initialised = this.initialise();
  }

  async initialise() {
    // Nothing to do
  }

  // The business logic for choosing the mapping of stream keys
  chooseStreamKey(sourceKey: StreamKey, metadata: StreamMetadataMessage): StreamKey {
    const cfg = this.cfg;
    const destKey: StreamKey = {
      sourceName: cfg.sourceName || sourceKey.sourceName,
      programNumber: cfg.programNumber ?? sourceKey.programNumber,
      streamId: cfg.streamId ?? sourceKey.streamId,
      renditionName: cfg.renditionName || sourceKey.renditionName,
    };
    switch (cfg.mode) {
      case "simple":
        // Nothing to do
        break;
      case "by-media-type":
        // Note: cfg.streamId should be specified
        switch (metadata?.case) {
          case "video":
            destKey.streamId += 0;
            break;
          case "audio":
            destKey.streamId += 1;
            break;
          case "subtitle":
            destKey.streamId += 2;
            break;
          case "ancillary":
            destKey.streamId += 3;
            break;
          case "playlist":
            destKey.streamId += 4;
            break;
          case undefined:
            destKey.streamId += 5;
            break;
          default:
            assertUnreachable(metadata);
        }
        break;
      // This one is stateful
      case "in-order": {
        // So first we see if it was mapped already
        for (const m of this.mapping) {
          if (streamKeysAreEqual(sourceKey, m.from.metadata.streamKey)) {
            return m.to;
          }
        }
        // And then we look up the next available `streamId` for the program
        let streamId = undefined;
        for (const program of this.history) {
          if (program.sourceName === destKey.sourceName && program.programNumber === destKey.programNumber) {
            streamId = ++program.lastStreamId;
            break;
          }
        }
        // And add it if it did not exist
        if (streamId === undefined) {
          streamId = cfg.streamId ?? 1;
          this.history.push({
            sourceName: destKey.sourceName,
            programNumber: destKey.programNumber,
            lastStreamId: streamId,
          });
        }
        destKey.streamId = streamId;
        break;
      }
      default:
        if (cfg.mode !== undefined && cfg.mode !== "")
          assertUnreachable(cfg.mode);
    }
    return destKey;
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    this.currentSources.forEach((source) => source.unregisterForContextChange(this));
    this.currentSources = sources;
    this.currentSources.forEach((source) => source.registerForContextChange(this));
    void this.sourceContextChange(() => { });
  }

  public async sourceContextChange(_responseCallback: (error?: SubscriptionError) => void): Promise<boolean> {
    const currentMapping = this.currentSources.flatMap(source => source.latestStreams().map(stream => {
      const sourceKey: StreamKey = stream.metadata.streamKey;
      const destKey = this.chooseStreamKey(sourceKey, stream.metadata.message);
      // Track what stream (media node, metadata, and stream key) it is
      // coming from,  what stream key it is mapping to, its SDK media node,
      // and what subscription it comes from (for selecting output stream keys)
      return { from: stream, to: destKey, node: undefined, nodeDescriptionId: source.sourceDescription.id };
    }));

    await this.updateNodes(this.diff(currentMapping));
    return false;
  }

  diff(currentMapping: Mapping[]): Diff {
    // Diffing
    const previousMapping = this.mapping.map(fromTo => ({ ...fromTo, used: false }));

    const added: Mapping[] = [];
    const removed: Mapping[] = [];
    const unchanged: Mapping[] = [];

    for (const fromTo of currentMapping) {
      let found = undefined;
      for (const prev of previousMapping) {
        if (prev.used) continue;
        if (streamKeysAreEqual(fromTo.from.metadata.streamKey, prev.from.metadata.streamKey)) {
          found = prev;
          prev.used = true;
          break;
        }
      }
      if (!found) {
        added.push(fromTo);
      } else if (!streamKeysAreEqual(fromTo.to, found.to)) {
        added.push(fromTo);
        removed.push(found);
      } else {
        unchanged.push(fromTo);
      }
    }
    for (const prev of previousMapping) {
      if (!prev.used) {
        removed.push(prev);
      }
    }

    return { added, removed, unchanged };
  }

  async updateNodes({ added, removed, unchanged }: Diff) {
    debuglog("SKO update (added/removed)", added.map(showMapping), removed.map(showMapping));
    // Apply the diff
    const promises: Promise<void>[] = [];
    for (const fromTo of added) {
      const awaiting = this.norsk.processor.transform.streamKeyOverride({
        id: `sko.${StreamKeyOverride.uid++}[${showStreamKey(fromTo.to)}]`,
        onCreate: (node) => {
          this.relatedMediaNodes.addInput(node);
          this.relatedMediaNodes.addOutput(node);
          fromTo.node = node;
          node.subscribe([{ source: fromTo.from.mediaNode, sourceSelector: () => [fromTo.from.metadata.streamKey] }]);
        },
        streamKey: fromTo.to,
      });
      promises.push(awaiting.then());
    }
    for (const { node } of removed) {
      if (!node) continue;
      this.relatedMediaNodes.removeInput(node);
      this.relatedMediaNodes.removeOutput(node);
      const awaiting = node.close();
      promises.push(awaiting);
    }
    this.mapping = added.concat(unchanged);
    await Promise.all(promises);
  }

  async close() {
    await this.updateNodes({ added: [], removed: this.mapping, unchanged: [] });
  }

  // This replaces the "fixed-list" `selector` in info.ts, since it requires
  // knowing the mapping of stream keys at runtime (and their association to
  // particular subscriptions).
  selectOutputs(selectionKeys: string[]): StreamKey[] {
    if (this.cfg.output === 'merged') {
      if (!selectionKeys.length) return [];
      return this.mapping.map(m => m.to);
    }
    return this.currentSources.flatMap(source => {
      const sourceNode = source.sourceDescription;
      const produces = sourceNode.info.subscription.produces;
      if (produces?.type != "fixed-list") {
        if (selectionKeys.includes(sourceNode.id)) {
          return this.mapping
            .filter(m => m.nodeDescriptionId === sourceNode.id)
            .map(m => m.to);
        } else {
          return [];
        }
      }
      // Remove the prefix from the keys that apply to this upstream source
      const prefix = `${sourceNode.id}-`;
      const upstreamKeys = selectionKeys
        .filter(k => k.startsWith(prefix))
        .map(k => k.substring(prefix.length));
      // Recursively find the stream keys for upstream
      const upstream = source.latestStreams(upstreamKeys).map(x => x.metadata.streamKey);
      // And put it through the current mapping
      const downstream = [];
      for (const sourceKey of upstream) {
        for (const m of this.mapping) {
          if (streamKeysAreEqual(sourceKey, m.from.metadata.streamKey)) {
            downstream.push(m.to);
            break;
          }
        }
      }
      return downstream;
    });
  }
}

function showMapping({ from, to }: Mapping): string {
  return `${showStreamKey(from.metadata.streamKey)} -> ${showStreamKey(to)}`;
}
function showStreamKey(key: StreamKey): string {
  return `${key.sourceName}-${key.programNumber}-${key.streamId}-${key.renditionName}`;
}
