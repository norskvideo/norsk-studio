import { Norsk, WhepOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { InstanceRouteInfo, OnCreated, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { IceServer } from '@norskvideo/norsk-studio/lib/shared/config';
import { webRtcSettings } from '../shared/webrtcSettings';
import { OpenAPIV3 } from 'openapi-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import fs from 'fs/promises';
import { resolveRefs } from 'json-refs';
import path from 'path';
import YAML from 'yaml';
import { paths } from './types';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import { ReportBuilder } from '@norskvideo/norsk-studio/lib/runtime/execution';

export type WhepOutputSettings = {
  id: string;
  displayName: string;
  bufferDelayMs?: SdkSettings['bufferDelayMs'];
  __global: {
    iceServers: IceServer[];
  }
};

export type WhepOutputState = {
  enabled: boolean;
};

export type WhepOutputCommand = {
  type: 'enable-output' | 'disable-output';
};

export type WhepOutputEvent = {
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
  };
}

function post<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['post']!),
    method: 'POST' as const,
  };
}

class WhepOutput extends CustomSinkNode {
  norsk: Norsk;
  cfg: WhepOutputSettings;
  report: ReportBuilder;  
  enabled: boolean = true;
  nodeCounter: number = 0;
  initialised: Promise<void>;
  playerUrl?: string;

  
  constructor(cfg: WhepOutputSettings, norsk: Norsk, report: ReportBuilder) {  
    super(cfg.id);
    this.cfg = cfg;
    this.norsk = norsk;
    this.report = report;
    this.initialised = this.initialise();
  }

  static async create(norsk: Norsk, cfg: WhepOutputSettings, report: ReportBuilder) { 
    const node = new WhepOutput(cfg, norsk, report);
    await node.initialised;
    return node;
  }

  incrementNodeId(id: string): string {
    this.nodeCounter++;
    return `${id}-${this.nodeCounter}`;
  }

  async initialise(): Promise<void> {
    if (!this.enabled) return;

    const mappedCfg: SdkSettings = {
      id: this.incrementNodeId(this.cfg.id),
      bufferDelayMs: this.cfg.bufferDelayMs,
      ...webRtcSettings(this.cfg.__global.iceServers),
    };

    const node = await this.norsk.output.whep(mappedCfg);
    this.playerUrl = node.playerUrl; // Store the URL
    
    if (this.playerUrl) {
      this.report.registerOutput(this.cfg.id, this.playerUrl);
    }
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
      debuglog("Output disabled", { id: this.id });
    }
    await this.close();
  }

}


export default class WhepOutputDefinition implements ServerComponentDefinition<WhepOutputSettings, WhepOutput, WhepOutputState, WhepOutputCommand> {
  async create(norsk: Norsk, cfg: WhepOutputSettings, cb: OnCreated<WhepOutput>, { updates, report }: StudioRuntime<WhepOutputState, WhepOutputCommand, WhepOutputEvent>) {
    const node = await WhepOutput.create(norsk, cfg, report);
    cb(node); 
    updates.update({
      enabled: true,
    });
    updates.raiseEvent({
      type: 'output-enabled'
    }); 
    
  } 

  async handleCommand(node: WhepOutput, command: WhepOutputCommand) {
    switch (command.type) {
      case 'enable-output':
        await node.enableOutput();
        break;
      case 'disable-output':
        await node.disableOutput();
        break;
      default:
        assertUnreachable(command.type);
    }
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<WhepOutputSettings, WhepOutput, WhepOutputState, WhepOutputCommand, WhepOutputEvent>[]> {
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
            runtime.updates.sendCommand({ type: 'enable-output' });
            runtime.updates.raiseEvent({ type: 'output-enabled' });
            
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
            runtime.updates.sendCommand({ type: 'disable-output' });
            runtime.updates.raiseEvent({ type: 'output-disabled' });

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