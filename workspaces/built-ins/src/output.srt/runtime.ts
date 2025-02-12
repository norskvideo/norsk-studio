import { Norsk, ReceiveFromAddressAuto, SrtOutputSettings as SdkSettings, SrtOutputNode } from '@norskvideo/norsk-sdk';
import { InstanceRouteInfo, OnCreated, ServerComponentDefinition, StudioRuntime, StudioNodeSubscriptionSource, CreatedMediaNode } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSinkNode, SubscriptionOpts } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import type { SocketOptions } from '../shared/srt-types';
import { OpenAPIV3 } from 'openapi-types';
import fs from 'fs/promises';
import { resolveRefs } from 'json-refs';
import path from 'path';
import YAML from 'yaml';
import { paths } from './types';
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';

export type SrtOutputSettings = Pick<SdkSettings, 'port' | 'host' | 'mode' | 'passphrase' | 'streamId' | 'bufferDelayMs' | 'avDelayMs'> & {
  id: string,
  displayName: string,
  notes?: string,
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

class SrtOutput extends CustomSinkNode {
  norsk: Norsk;
  cfg: SrtOutputSettings;
  srtOutputNode: SrtOutputNode | null = null;
  enabled: boolean = true;
  initialised: Promise<void>;
  runtime: StudioRuntime<SrtOutputState, SrtOutputCommand, SrtOutputEvent>;

  control: ContextPromiseControl = new ContextPromiseControl(this.subscribeImpl.bind(this));
  
  currentSources: Map<CreatedMediaNode, StudioNodeSubscriptionSource> = new Map();
 
  static async create(norsk: Norsk, cfg: SrtOutputSettings,  runtime: StudioRuntime<SrtOutputState, SrtOutputCommand, SrtOutputEvent>) {
    const node = new SrtOutput(cfg, norsk, runtime);
    await node.initialised;
    return node;
  }

  constructor(cfg: SrtOutputSettings, norsk: Norsk,  runtime: StudioRuntime<SrtOutputState, SrtOutputCommand, SrtOutputEvent>) {
    super(cfg.id);
    this.cfg = cfg;
    this.id = cfg.id;
    this.norsk = norsk;
    this.runtime = runtime;
    this.initialised = Promise.resolve();
  }
  
  async enableOutput() {
    if (!this.enabled) {
      this.enabled = true;   
      await this.control.schedule();
      this.runtime.updates.raiseEvent({ type: 'output-enabled' });
      debuglog("Output enabled", { id: this.id });
    }
  }

  async disableOutput() {
    if (this.enabled) {
      this.enabled =false;
      if (this.srtOutputNode){
        await this.srtOutputNode.close();
        this.srtOutputNode = null;
      }    
      this.runtime.updates.raiseEvent({
        type: 'output-disabled'
      })
      debuglog("Output disabled", { id: this.id });
    }
  }

  override subscribe(sources: StudioNodeSubscriptionSource[], _opts?: SubscriptionOpts): void {
      this.currentSources = new Map();
      sources.forEach((s) => {
        this.currentSources.set(s.source, s);
      });
      
      this.control.setSources(sources);
  }

  async subscribeImpl(sources: StudioNodeSubscriptionSource[]) {
    if (!this.enabled) {
      debuglog("Skipping context handling - output disabled", { id: this.id });
      return;
    }

    //for (const [_, source] of this.currentSources) {
      // if (source) {
        const videoSource = sources.filter((s) => s.streams.select.includes("video")).at(0)?.selectVideo();
        const audioSource = sources.filter((s) => s.streams.select.includes("audio")).at(0)?.selectAudio();
    
        const subscriptions: ReceiveFromAddressAuto[] = [];
    
        if (videoSource && videoSource.length > 0) {
          subscriptions.push(videoSource[0]);
        }
    
        if (audioSource && audioSource.length > 0) {
          subscriptions.push(audioSource[0]);
        }

        if (subscriptions.length > 0) {
          if (!this.srtOutputNode) {
            const node = await this.norsk.output.srt({
              ...this.cfg,
              ...this.cfg.socketOptions,
              id: this.cfg.id,
            });
            this.srtOutputNode = node;
          }
          this.srtOutputNode.subscribe(subscriptions, (ctx) => {
            return ctx.streams.length === subscriptions.length;
          })
        } else {
          await this.srtOutputNode?.close();
          this.srtOutputNode = null;
        }
      //}
    //}
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

export default class SrtOutputDefinition implements ServerComponentDefinition<SrtOutputSettings, SrtOutput, SrtOutputState, SrtOutputCommand, SrtOutputEvent> {
  async create(norsk: Norsk, cfg: SrtOutputSettings, cb: OnCreated<SrtOutput>, runtime: StudioRuntime<SrtOutputState, SrtOutputCommand, SrtOutputEvent>) {
    const node = await SrtOutput.create(norsk, cfg, runtime);
    cb(node);
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