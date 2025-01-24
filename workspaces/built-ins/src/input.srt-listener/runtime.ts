import { Norsk, SrtInputSettings as SdkSettings, SrtInputNode } from '@norskvideo/norsk-sdk';
import { SocketOptions } from '../shared/srt-types';
import { CreatedMediaNode, InstanceRouteInfo, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { OpenAPIV3 } from 'openapi-types';
import fs from 'fs/promises';
import { resolveRefs } from 'json-refs';
import path from 'path';
import YAML from 'yaml';
import { paths } from './openApi';

export type SrtInputSettings = Pick<SdkSettings
  , 'port'
  | 'host'
  | 'passphrase'>
  & {
    id: string,
    displayName: string,

    // We'll either only allow the stream ids provided
    // or we'll assign them automatically by index
    sourceNames: 'permissive' | 'strict',
    streamIds: string[],
    socketOptions: SocketOptions
  };

export type SrtInputState = {
  connectedStreams: string[]
}

export type SrtInputEvent = {
  type: "source-connected", streamId: string
} |
{ type: "source-disconnected", streamId: string }

export type SrtInputCommand = {
  type: "disconnect-source",
  streamId: string,
}

export class SrtInput implements CreatedMediaNode {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  norsk: Norsk;
  cfg: SrtInputSettings;
  activeStreams = new Map<string, number>();
  initialised: Promise<void>;
  srtServer: SrtInputNode | null = null;

  updates: RuntimeUpdates<SrtInputState, SrtInputCommand, SrtInputEvent>;
  nodeCounter: number = 0;

  static async create(norsk: Norsk, cfg: SrtInputSettings, updates: RuntimeUpdates<SrtInputState, SrtInputCommand, SrtInputEvent>) {
    const node = new SrtInput(norsk, cfg, updates);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: SrtInputSettings, updates: RuntimeUpdates<SrtInputState, SrtInputCommand, SrtInputEvent>) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
  }

  async initialise(): Promise<void> {
    this.srtServer = await this.norsk.input.srt({
      mode: 'listener',
      sourceName: 'unused',
      id: `${this.cfg.id}-srt-listener`,
      port: this.cfg.port,
      host: this.cfg.host,
      passphrase: this.cfg.passphrase,

      onConnectionStatusChange: (status, sourceName) => {
        switch (status) {
          case 'disconnected':
            if (sourceName) {
              debuglog("Stream with source name has disconnected, clearing it ", { sourceName });
              this.activeStreams.delete(sourceName);
              this.updates.raiseEvent({ type: "source-disconnected", streamId: sourceName });
            }
            break;
          default:
            assertUnreachable(status);
        }
      },
      onConnection: (streamId, index, remoteHost) => {
        if (this.cfg.sourceNames == 'permissive') {
          if (this.cfg.streamIds.includes(streamId) && !this.activeStreams.has(streamId)) {
            debuglog("Accepting SRT connection", { streamId, remoteHost });
            this.activeStreams.set(streamId, index);
            this.updates.raiseEvent({ type: "source-connected", streamId });
            return {
              accept: true,
              sourceName: streamId
            };
          }
          const streamName = this.cfg.streamIds.find((s) => !this.activeStreams.has(s));
          if (!streamName) {
            debuglog("Rejecting connection as no stream ids left to assign", { count: index, remoteHost });
            return {
              accept: false
            };
          }
          debuglog("Accepting SRT connection", { streamName, remoteHost });
          this.updates.raiseEvent({ type: "source-connected", streamId: streamName });
          this.activeStreams.set(streamName, index);
          return {
            accept: true,
            sourceName: streamName
          };
        } else {
          if (this.activeStreams.has(streamId)) {
            debuglog("Rejecting SRT connection because streamId already is connected", { streamId, remoteHost });
            return {
              accept: false,
            };
          }
          if (this.cfg.streamIds.includes(streamId)) {
            debuglog("Accepting SRT connection", { streamId, remoteHost });
            this.activeStreams.set(streamId, index);
            return {
              accept: true,
              sourceName: streamId
            };
          }
          debuglog("Rejecting connection with unknown streamId", { streamId, remoteHost });
          return {
            accept: false
          };
        }
      },

      onClose: () => {
      },

      onCreate: (node) => {
        this.relatedMediaNodes.addOutput(node);
      }
      //  ...this.cfg,
    })
  }

  async disconnectStream(streamId: string) {
    if (this.srtServer) {
      const index = this.activeStreams.get(streamId);
      if (index !== undefined) {
        this.srtServer.closeStream(index);
      }
    }
  }
}

type Transmuted<T> = {
  [Key in keyof T]: OpenAPIV3.PathItemObject;
};
function coreInfo<T>(path: keyof T, op: OpenAPIV3.OperationObject) {
  return {
    url: path,
    summary: op.summary,
    description: op.description,
    requestBody: op.requestBody,
    responses: op.responses,
  }
}

function post<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['post']!),
    method: 'POST' as const,
  }
}

export default class SrtInputDefinition implements ServerComponentDefinition<SrtInputSettings, SrtInput, SrtInputState, SrtInputCommand> {
  async create(norsk: Norsk, cfg: SrtInputSettings, cb: OnCreated<SrtInput>, runtime: StudioRuntime<SrtInputState, SrtInputCommand, SrtInputEvent>) {
    const node = await SrtInput.create(norsk, cfg, runtime.updates);
    cb(node);
  }

  async handleCommand(node: SrtInput, command: SrtInputCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'disconnect-source':
        await node.disconnectStream(command.streamId);
        break;
      default:
        assertUnreachable(commandType);
    }
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<SrtInputSettings, SrtInput, SrtInputState, SrtInputCommand>[]> {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'));
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
    const paths = resolved.paths as Transmuted<paths>;

    return [
      {
        ...post<paths>('/disconnect', paths),
        handler: ({ runtime }) => async (req, res) => {
          try {
            const { streamId } = req.body;
            if (!streamId) {
              return res.status(400).json({ error: 'Stream name is required' });
            }

            const state = runtime.updates.latest();
            console.log("Current state during disconnect:", state);

            if (!state.connectedStreams.includes(streamId)) {
              return res.status(404).json({ error: 'Stream not found or not connected' });
            }
            runtime.updates.sendCommand({
              type: 'disconnect-source',
              streamId
            })
            res.status(204).send();
          } catch (error) {
            console.error('Error in disconnect handler:', error);
            res.status(500).json({ error: 'Failed to disconnect stream' });
          }
        }
      }
    ];
  }
}
