import { Norsk, requireAV, selectAll } from '@norskvideo/norsk-sdk';

import { OnCreated, ServerComponentDefinition } from 'norsk-studio/lib/extension/runtime-types';
import { CustomSourceNode } from 'norsk-studio/lib/extension/base-nodes';

import express, { Response } from 'express';
import { DescribeFlowCommand, Flow, ListFlowsCommand, ListedFlow, MediaConnectClient, MediaConnectServiceException, Output } from '@aws-sdk/client-mediaconnect';
import { errorlog } from 'norsk-studio/lib/server/logging';


export type MediaConnectConfig = {
  id: string,
  displayName: string,
  flowArn: string,
  outputArn: string
}

export default class MediaConnectSourceDefinition implements ServerComponentDefinition<MediaConnectConfig, MediaConnectSource> {
  async create(norsk: Norsk, cfg: MediaConnectConfig, cb: OnCreated<MediaConnectSource>) {
    const node = await MediaConnectSource.create(norsk, cfg);
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

  static async create(norsk: Norsk, cfg: MediaConnectConfig) {
    const node = new MediaConnectSource(cfg, norsk);
    await node.initialised;
    return node;
  }

  constructor(cfg: MediaConnectConfig, norsk: Norsk) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
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
      return;
    }
    output = flow?.Outputs?.find((o) => o.OutputArn == this.cfg.outputArn);

    if (!flow || !output) {
      errorlog("Failed to load flow and output details, cannot start node", this.id, this.cfg);
      return;
    }

    if (!output.ListenerAddress) {
      errorlog("No listener address on flow output, cannot start", this.id, this.cfg);
      return;
    }

    if (!output.Port) {
      errorlog("No listener port on flow output, cannot start", this.id, this.cfg);
      return;
    }
    const srt = await this.norsk.input.srt({
      id: `${this.id}-srt`,
      mode: 'caller',
      ip: output.ListenerAddress,
      port: output.Port,
      sourceName: this.id
    })

    // TODO this is bodged in for NAB AWS purposes
    const align = await this.norsk.processor.transform.streamAlign({
      id: `${this.id}-align`,
      frameRate: { frames: 25, seconds: 1 },
      sampleRate: 96000,
      syncAv: true
    })
    align.subscribe([{
      source: srt, sourceSelector: selectAll
    }], requireAV);
    this.setup({ output: [align] });
  }

  override async close() {
    await super.close();
  }
}

