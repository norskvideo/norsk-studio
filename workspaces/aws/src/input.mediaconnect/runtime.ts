import { Norsk } from '@norskvideo/norsk-sdk';

import { OnCreated, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { CustomSourceNode } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

import express, { Response } from 'express';
import { DescribeFlowCommand, Flow, ListFlowsCommand, ListedFlow, MediaConnectClient, MediaConnectServiceException, Output } from '@aws-sdk/client-mediaconnect';
import { errorlog } from '@norskvideo/norsk-studio/lib/server/logging';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';


export type MediaConnectConfig = {
  id: string,
  displayName: string,
  flowArn: string,
  outputArn: string
}

export default class MediaConnectSourceDefinition implements ServerComponentDefinition<MediaConnectConfig, MediaConnectSource> {
  async create(norsk: Norsk, cfg: MediaConnectConfig, cb: OnCreated<MediaConnectSource>, runtime: StudioRuntime) {
    const node = await MediaConnectSource.create(norsk, cfg, runtime);
    cb(node);
  }

  routes() {
    const router = express.Router()
    router.get("/flows", async (_req, res) => {
      let flows: ListedFlow[] = [];

      try {
        const client = new MediaConnectClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
        const response = await client.send(new ListFlowsCommand({ MaxResults: 100 }));
        flows = response.Flows ?? [];
        client.destroy();
      } catch (e) {
        handleAwsException(e, res);
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(flows));
    })
    router.get("/flows/:arn", async (req, res) => {
      let flow: Flow | undefined = undefined;

      try {
        const client = new MediaConnectClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
        const response = await client.send(new DescribeFlowCommand({ FlowArn: req.params.arn }));
        flow = response.Flow;
        client.destroy();
      } catch (e) {
        handleAwsException(e, res);
        return;
      }
      if (!flow) {
        res.writeHead(404);
        res.end("Flow not found?");
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(flow));
    })
    return router;
  }
}

// 1999 called and asked for its Java back
function handleAwsException(e: unknown, res: Response) {
  errorlog("AWS exception", e);
  if (e instanceof MediaConnectServiceException) {
    res.writeHead(e?.$metadata?.httpStatusCode ?? 500);
    res.end(JSON.stringify(e));
  } else {
    res.writeHead(500);
    res.end(JSON.stringify(e));
  }
}

export class MediaConnectSource extends CustomSourceNode {
  norsk: Norsk;
  cfg: MediaConnectConfig;
  initialised: Promise<void>;
  runtime: StudioRuntime;

  static async create(norsk: Norsk, cfg: MediaConnectConfig, runtime: StudioRuntime) {
    const node = new MediaConnectSource(cfg, norsk, runtime);
    await node.initialised;
    return node;
  }

  constructor(cfg: MediaConnectConfig, norsk: Norsk, runtime: StudioRuntime) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
    this.runtime = runtime;
    this.initialised = this.initialise();
  }

  async initialise() {
    let flow: Flow | undefined = undefined;
    let output: Output | undefined = undefined;
    try {
      const client = new MediaConnectClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
      const response = await client.send(new DescribeFlowCommand({ FlowArn: this.cfg.flowArn }));
      flow = response.Flow;
      client.destroy();
    } catch (e) {
      errorlog("Failed to retrieve flow from AWS, cannot start media node", e);
      this.runtime.updates.setAlert('failed-to-start', { message: 'Failed to retrieve flow from AWS, component cannot start', level: 'error' })
      return;
    }
    output = flow?.Outputs?.find((o) => o.OutputArn == this.cfg.outputArn);

    if (!flow || !output) {
      this.runtime.updates.setAlert('failed-to-start', { message: 'Failed to retrieve flow from AWS, component cannot start', level: 'error' })
      return;
    }

    if (!output.ListenerAddress) {
      this.runtime.updates.setAlert('failed-to-start', { message: 'No listener address on flow output, component cannot start', level: 'error' })
      return;
    }

    if (!output.Port) {
      this.runtime.updates.setAlert('failed-to-start', { message: 'No port on flow output, component cannot start', level: 'error' })
      return;
    }
    this.runtime.updates.setAlert('disconnected', { message: 'Not connected to SRT endpoint', level: 'error' })
    const srt = await this.norsk.input.srt({
      id: `${this.id}-srt`,
      mode: 'caller',
      ip: output.ListenerAddress,
      port: output.Port,
      sourceName: this.id,
      onConnection: () => {
        this.runtime.updates.clearAlert('disconnected');
        return { accept: true, sourceName: this.id }
      },
      onConnectionStatusChange: (status) => {
        switch (status) {
          case 'disconnected':
            this.runtime.updates.setAlert('disconnected', { message: 'Disconnected from SRT endpoint', level: 'error' })
            break;
          default:
            assertUnreachable(status);
        }

      }
    })

    this.setup({ output: [srt] });
  }

  override async close() {
    await super.close();
  }
}

