import { Norsk, RtmpServerInputSettings as SdkSettings, RtmpServerStreamKeys, RtmpServerInputNode } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, InstanceRouteArgs, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import path from 'path';
import { paths } from './types';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { defineApi } from '@norskvideo/norsk-studio/lib/server/api';

export type RtmpInputSettings = Pick<SdkSettings
  , 'port'
  | 'ssl'>
  & {
    id: string,
    displayName: string,
    notes?: string,
    appName: string,
    streamNames: string[],
  };

export type RtmpInputState = {
  connectedStreams: string[],
  disabledStreams: string[]

}

export type RtmpInputEvent = {
  type: "source-connected", streamName: string
} | { type: "source-disconnected", streamName: string }
  | { type: "source-enabled", streamName: string }
  | { type: "source-disabled", streamName: string }



export type RtmpInputCommand = {
  type: "disable-source",
  streamName: string,
} | {
  type: "enable-source",
  streamName: string,
} | {
  type: "reset-source",
  streamName: string,
}

export class RtmpInput implements CreatedMediaNode {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  norsk: Norsk;
  cfg: RtmpInputSettings;

  activeStreams = new Map<string, number>();
  disabledStreams = new Set<string>();

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

      onConnectionStatusChange: (_cid: string, status, streamKeys: RtmpServerStreamKeys) => {
        switch (status) {
          case 'disconnected':
            for (const key of streamKeys) {
              if (key.videoStreamKey.sourceName) {
                const streamName = key.videoStreamKey.sourceName.sourceName;
                if (streamName) {
                  this.activeStreams.delete(streamName);
                  this.updates.raiseEvent({ type: "source-disconnected", streamName });
                  debuglog("Stream disconnected", { streamName, activeStreams: this.activeStreams });
                }
              }
            }
        }
      },

      onConnection: (connnectionId: string, app: string, url: string) => {
        if (this.disabledStreams.has(connnectionId)) {
          debuglog("Rejecting connection as stream is presently disabled", { url });
          return {
            accept: false
          };
        }
        if (app === this.cfg.appName) {
          debuglog("Accepted connection with app name", { app, connnectionId, url });
          return { accept: true };
        } else {
          debuglog("Rejecting connection with unknown app name", { app, connnectionId, url });
          return { accept: false };
        }
      },

      onStream: (_cid: string, _app: string, _url: string, streamId: number, publishingName: string) => {
        debuglog("Stream request received", { publishingName, activeStreams: this.activeStreams });

        if (this.disabledStreams.has(publishingName)) {
          debuglog("Rejecting connection as stream is presently disabled", { publishingName });
          return {
            accept: false,
            reason: "Stream is disabled"
          };
        }

        if (!this.cfg.streamNames.includes(publishingName)) {
          debuglog("Rejecting unknown stream name", { publishingName });
          return {
            accept: false,
            reason: "Unknown stream name"
          };
        }

        if (this.activeStreams.has(publishingName)) {
          debuglog("Rejecting duplicate stream connection", { publishingName });
          return {
            accept: false,
            reason: "Stream already connected"
          };
        }

        if (this.cfg.streamNames.includes(publishingName)) {
          debuglog("Accepting stream", { publishingName });
          this.activeStreams.set(publishingName, streamId);
          this.updates.raiseEvent({ type: "source-connected", streamName: publishingName });
        }
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

      onClose: () => { },

      onCreate: (node) => {
        this.relatedMediaNodes.addOutput(node);
      }
    });
  }

  async enableSource(streamName: string) {
    this.disabledStreams.delete(streamName);
    this.updates.raiseEvent({
      type: 'source-enabled',
      streamName
    });
    debuglog("Stream enabled", { streamName, activeStreams: this.activeStreams });
  }

  async disableSource(streamName: string) {
    this.disabledStreams.add(streamName);
    await this.resetSource(streamName);
    this.updates.raiseEvent({
      type: 'source-disabled',
      streamName
    });
  }

  async resetSource(streamName: string) {
    if (this.rtmpServer) {
      this.rtmpServer.closeConnection(streamName);
      this.updates.raiseEvent({
        type: 'source-disconnected',
        streamName
      })
    }
    debuglog("Stream reset", { streamName, afterState: this.activeStreams });
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
      case 'disable-source':
        await node.disableSource(command.streamName);
        break;
      case 'enable-source':
        await node.enableSource(command.streamName);
        break;
      case 'reset-source':
        await node.resetSource(command.streamName);
        break;
      default:
        assertUnreachable(commandType);
    }
  }

  async instanceRoutes() {
    return defineApi<paths, InstanceRouteArgs<RtmpInputSettings, RtmpInput, RtmpInputState, RtmpInputCommand>>(
      path.join(__dirname, 'types.yaml'),
      {
        '/disconnect': {
          post: ({ runtime }) => async (req, res) => {
            try {
              const { streamName } = req.body;
              if (!streamName) {
                return res.status(400).json({ error: 'Stream name is required' });
              }

              const state = runtime.updates.latest();
              debuglog("Current state during disconnect:", state);

              if (!state.connectedStreams.includes(streamName)) {
                return res.status(404).json({ error: 'Stream not found or not connected' });
              }
              runtime.updates.sendCommand({
                type: 'reset-source',
                streamName
              })
              res.status(204).send();
            } catch (error) {
              console.error('Error in disconnect handler:', error);
              res.status(500).json({ error: 'Failed to disconnect stream' });
            }
          }

        },
        '/enable': {
          post: ({ runtime }) => async (req, res) => {
            try {
              const { streamName } = req.body;
              if (!streamName) {
                return res.status(400).json({ error: 'Stream name is required' });
              }

              runtime.updates.sendCommand({
                type: 'enable-source',
                streamName
              })
              res.status(204).send();
            } catch (error) {
              console.error('Error in disconnect handler:', error);
              res.status(500).json({ error: 'Failed to disconnect stream' });
            }
          }

        },
        '/disable': {
          post: ({ runtime }) => async (req, res) => {
            try {
              const { streamName } = req.body;
              if (!streamName) {
                return res.status(400).json({ error: 'Stream name is required' });
              }
              runtime.updates.sendCommand({
                type: 'disable-source',
                streamName
              })
              res.status(204).send();
            } catch (error) {
              console.error('Error in disconnect handler:', error);
              res.status(500).json({ error: 'Failed to disconnect stream' });
            }
          }

        }
      });

  }
}
