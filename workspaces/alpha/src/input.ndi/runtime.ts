import { Norsk, NdiInputSettings as SdkSettings, NdiSource as SdkNdiSource } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition, StaticRouteInfo } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';
import { components, paths } from './types';

export type NdiInputSettings = Pick<SdkSettings, 'ndiSourceName' | 'ndiReceiveName' > & {
  id: string,
  displayName: string,
}

export type NdiSource = components['schemas']['ndiSource'];

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

function get<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['get']!),
    method: 'GET' as const,
  }
}

export default class NdiInputDefinition implements ServerComponentDefinition<NdiInputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: NdiInputSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {
        const input = await norsk.input.ndi({sourceName: `filemp4-${cfg.id}`,
                                            ...cfg });

        return input;
      }
    )
    await wrapper.initialised;
    cb(wrapper);
  }

  async staticRoutes(): Promise<StaticRouteInfo[]> {
    let sources: NdiSource[] = [];

    const sourcesDiscovered = (discoveredSources: SdkNdiSource[]) => {
      sources = discoveredSources.map(({url, name}) => { return {url, name}; } );
    }

    // Get discovery running
    const norsk = await Norsk.connect();

    const _discovery = await norsk.system.ndiDiscovery({ showLocalSources: true, cb: sourcesDiscovered })
    
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);

    const paths = resolved.paths as Transmuted<paths>;

    return [
      {
        ...get<paths>('/sources', paths),
        handler: (_) => async (_req: Request, res: Response) => {
          res.send(JSON.stringify(sources));
        }
      }
    ];
  }
}
