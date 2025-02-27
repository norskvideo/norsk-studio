import { Norsk, NdiInputSettings as SdkSettings, NdiSource as SdkNdiSource } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { defineApi } from '@norskvideo/norsk-studio/lib/server/api';
import { OnCreated, ServerComponentDefinition, StaticRouteInfo } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { Request, Response } from 'express';
import path from 'path';
import { components, paths } from './types';

export type NdiInputSettings = Pick<SdkSettings, 'ndiSourceName' | 'ndiReceiveName'> & {
  id: string,
  displayName: string,
}

export type NdiSource = components['schemas']['ndiSource'];

export default class NdiInputDefinition implements ServerComponentDefinition<NdiInputSettings, SimpleInputWrapper> {
  async create(norsk: Norsk, cfg: NdiInputSettings, cb: OnCreated<SimpleInputWrapper>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {
      const input = await norsk.input.ndi({
        sourceName: `filemp4-${cfg.id}`,
        ...cfg
      });

      return input;
    }
    )
    await wrapper.initialised;
    cb(wrapper);
  }

  async staticRoutes(): Promise<StaticRouteInfo[]> {
    let sources: NdiSource[] = [];

    const sourcesDiscovered = (discoveredSources: SdkNdiSource[]) => {
      sources = discoveredSources.map(({ url, name }) => { return { url, name }; });
    }

    // Get discovery running
    const norsk = await Norsk.connect();

    const _discovery = await norsk.system.ndiDiscovery({ showLocalSources: true, cb: sourcesDiscovered })

    return defineApi<paths, void>(
      path.join(__dirname, 'types.yaml'),
      {
        '/sources': {
          get: (_) => async (_req: Request, res: Response) => {
            res.send(JSON.stringify(sources));
          }
        }
      })
  }
}
