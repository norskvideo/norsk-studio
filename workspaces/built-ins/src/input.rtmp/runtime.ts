import { Norsk, RtmpServerInputSettings as SdkSettings, RtmpServerStreamKeys, RtmpServerInputNode } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, InstanceRouteInfo, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import fs from 'fs/promises';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';
import path from 'path';
import YAML from 'yaml';
import { paths } from './openApi';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';

export type RtmpInputSettings = Pick<SdkSettings
  , 'port'
  | 'ssl'>
  & {
    id: string,
    displayName: string,
    appName: string,
    streamNames: string[],
  };

export type RtmpInputState = {
  connectedSources: string[]
}

export type RtmpInputEvent = {
  type: "source-connected" | "source-disconnected",
  streamName: string,
}

export type RtmpInputCommand = {
  type: "disconnect-source",
  streamName: string,
}

export class RtmpInput implements CreatedMediaNode {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  norsk: Norsk;
  cfg: RtmpInputSettings;
  activeStreams: string[] = [];
  initialised: Promise<void>;
  rtmpServer: RtmpServerInputNode | null = null;

  updates: RuntimeUpdates<RtmpInputState, RtmpInputCommand, RtmpInputEvent>;

  static async create(norsk: Norsk, cfg: RtmpInputSettings, updates: RuntimeUpdates<RtmpInputState, RtmpInputCommand, RtmpInputEvent>) {
    const node = new RtmpInput(norsk, cfg, updates);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: RtmpInputSettings, updates: RuntimeUpdates<RtmpInputState, RtmpInputCommand, RtmpInputEvent>) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
  }

  async initialise(): Promise<void> {
    this.rtmpServer = await this.norsk.input.rtmpServer({
      id: this.id,
      port: this.cfg.port,
      ssl: this.cfg.ssl,
      sslOptions: {
        certFile: process.env.SSL_CERT_FILE,
        keyFile: process.env.SSL_KEY_FILE,
      },
      onConnection: (connectionId: string, app: string, url: string) => {
        if (app === this.cfg.appName) {
          debuglog("Accepted connection with app name", { app, connectionId, url });
          return { accept: true };
        } else {
          debuglog("Rejecting connection with unknown app name", { app, connectionId, url });
          return { accept: false };
        }
      },

      onStream: (cid: string, app: string, url: string, streamId: number, publishingName: string) => {
        debuglog("Stream request received", { publishingName, activeStreams: this.activeStreams });

        if (!this.cfg.streamNames.includes(publishingName)) {
          debuglog("Rejecting unknown stream name", { publishingName });
          return {
            accept: false,
            reason: "Unknown stream name"
          };
        }

        if (this.activeStreams.includes(publishingName)) {
          debuglog("Rejecting duplicate stream connection", { publishingName });
          return {
            accept: false,
            reason: "Stream already connected"
          };
        }

        debuglog("Accepting stream", { publishingName });

        this.activeStreams = [...this.activeStreams, publishingName];
        this.updates.update({
          connectedSources: [...this.activeStreams]
        });

        return {
          accept: true,
          videoStreamKey: {
            renditionName: this.cfg.appName + "-default",
            sourceName: publishingName,
          },
          audioStreamKey: {
            renditionName: this.cfg.appName + "-default",
            sourceName: publishingName,
          },
        };
      },


      onConnectionStatusChange: (_cid: string, status: string, streamKeys: RtmpServerStreamKeys) => {
        if (status !== "disconnected") {
          return;
        }
        for (const key of streamKeys) {
          if (key.videoStreamKey.sourceName) {
            const streamName = key.videoStreamKey.sourceName.sourceName;
            this.activeStreams = this.activeStreams.filter((s) => s !== streamName);
            this.updates.update({
              connectedSources: [...this.activeStreams]
            });
            this.updates.raiseEvent({ type: "source-disconnected", streamName });
            debuglog("Stream disconnected", { streamName, activeStreams: this.activeStreams });
          }
        }
      },
      onCreate: (node) => {
        this.relatedMediaNodes.addOutput(node);
      }
    });
  }

  async disconnectStream(streamName: string) {
    debuglog("Unsubscribing stream", { streamName, beforeState: this.activeStreams });

    if (this.rtmpServer) {
      //  TODO: Add this functionality to the Norsk SDK
    }

    debuglog("Stream unsubscribed", { streamName, afterState: this.activeStreams });
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

export default class RtmpInputDefinition implements ServerComponentDefinition<RtmpInputSettings, RtmpInput, RtmpInputState, RtmpInputCommand> {

  async create(norsk: Norsk, cfg: RtmpInputSettings, cb: OnCreated<RtmpInput>, runtime: StudioRuntime<RtmpInputState, RtmpInputCommand, RtmpInputEvent>) {
    const node = await RtmpInput.create(norsk, cfg, runtime.updates);
    cb(node);
  }

  async handleCommand(node: RtmpInput, command: RtmpInputCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'disconnect-source':
        await node.disconnectStream(command.streamName);
        break;
      default:
        assertUnreachable(commandType);
    }
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<RtmpInputSettings, RtmpInput, RtmpInputState, RtmpInputCommand>[]> {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'));
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
    const paths = resolved.paths as Transmuted<paths>;

    return [
      {
        ...post<paths>('/disconnect', paths),
        handler: ({ runtime }) => async (req, res) => {
          try {
            const { streamName } = req.body;
            if (!streamName) {
              return res.status(400).json({ error: 'Stream name is required' });
            }

            const state = runtime.updates.latest();
            console.log("Current state during disconnect:", state);

            if (!state.connectedSources.includes(streamName)) {
              return res.status(404).json({ error: 'Stream not found or not connected' });
            }
            runtime.updates.sendCommand({
              type: 'disconnect-source',
              streamName
            })
            res.status(204).send();
          } catch (error) {
            console.error('Error in disconnect handler:', error);
            res.status(500).json({ error: 'Failed to disconnect stream' });
          }
        }
      },
    ];
  }
}
