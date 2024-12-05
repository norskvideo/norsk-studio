import { Norsk, SrtOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { InstanceRouteInfo, OnCreated, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import type { SocketOptions } from '../shared/srt-types';
import { OpenAPIV3 } from 'openapi-types';
import fs from 'fs/promises';
import { resolveRefs } from 'json-refs';
import path from 'path';
import YAML from 'yaml';
import { paths } from './types';

export type SrtOutputSettings = Pick<SdkSettings, 'port' | 'host' | 'mode' | 'passphrase' | 'streamId' | 'bufferDelayMs' | 'avDelayMs'> & {
  id: string,
  displayName: string,
  socketOptions: SocketOptions
};

export type SrtOutputState = {
  enabled: boolean,
}

export type SrtOutputCommand = {
  type: 'enable-output' | 'disable-output',
}

export type SrtOutputEvent = {
  type: 'output-enabled' | 'output-disabled';
};

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

class SrtOutput extends CustomSinkNode {
  norsk: Norsk;
  cfg: SrtOutputSettings;
  enabled: boolean = true;
  initialised: Promise<void>;
  nodeCounter: number = 0;

  static async create(norsk: Norsk, cfg: SrtOutputSettings) {
    const node = new SrtOutput(cfg, norsk);
    await node.initialised;
    return node;
  }

  constructor(cfg: SrtOutputSettings, norsk: Norsk) {
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.initialised = this.initialise();
  }

  async initialise(): Promise<void> {
    const node = await this.norsk.output.srt({
      ...this.cfg,
      ...this.cfg.socketOptions,
      id: this.incrementNodeId(this.cfg.id),
    });

    this.setup({ sink: node });
  }

  async enableOutput() {
    if (!this.enabled) {
      this.enabled = true;     
      await this.initialise();
      debuglog("Output enabled", { id: this.id });
    }
  }

  async disableOutput() {
    if (this.enabled) {
      this.enabled = false;
      await this.close()
      debuglog("Output disabled", { id: this.id });
      }
  }

  incrementNodeId(id: string): string {
    this.nodeCounter++;
    return `${id}-${this.nodeCounter}`;
  }
}

export default class SrtOutputDefinition implements ServerComponentDefinition<SrtOutputSettings, SrtOutput, SrtOutputState, SrtOutputCommand, SrtOutputEvent> {
  async create(norsk: Norsk, cfg: SrtOutputSettings, cb: OnCreated<SrtOutput>, runtime: StudioRuntime<SrtOutputState, SrtOutputCommand, SrtOutputEvent>) {
    const node = await SrtOutput.create(norsk, cfg);
    cb(node);
    runtime.updates.raiseEvent({
      type: 'output-enabled'
    });
    runtime.updates.update({
      enabled: true,
    })
  }

  async handleCommand(node: SrtOutput, command: SrtOutputCommand) {
    switch (command.type) {
      case 'enable-output':
        await node.enableOutput();
        break;
      case 'disable-output':
        await node.disableOutput();
        break;
    }
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<SrtOutputSettings, SrtOutput, SrtOutputState, SrtOutputCommand, SrtOutputEvent>[]> {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'));
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
    const paths = resolved.paths as Transmuted<paths>;

    return [
      {
        ...post<paths>('/enable', paths),
        handler: ({ runtime }) => async (_req, res) => {
          try {
            const state = runtime.updates.latest();
            if (state.enabled) {
              return res.status(400).json({ error: 'Output is already enabled' });
            }

            runtime.updates.update({ ...state, enabled: true });

            runtime.updates.sendCommand({
              type: 'enable-output'
            });
           
            runtime.updates.raiseEvent({
              type: 'output-enabled'
            });

            res.sendStatus(204);
          } catch (error) {
            console.error('Error in enable handler:', error);
            res.status(500).json({ error: 'Failed to enable output' });
          }
        }
      },
      {
        ...post<paths>('/disable', paths),
        handler: ({ runtime }) => async (_req, res) => {
          try {
            const state = runtime.updates.latest();
            if (!state.enabled) {
              return res.status(400).json({ error: 'Output is already disabled' });
            }

            runtime.updates.update({ ...state, enabled: false });

            runtime.updates.sendCommand({
              type: 'disable-output'
            });
           
            runtime.updates.raiseEvent({
              type: 'output-disabled'
            });

            res.sendStatus(204);
          } catch (error) {
            console.error('Error in disable handler:', error);
            res.status(500).json({ error: 'Failed to disable output' });
          }
        }
      }
    ];
  }
}