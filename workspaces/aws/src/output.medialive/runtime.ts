import { Norsk } from '@norskvideo/norsk-sdk';
import { CustomSinkNode } from '@norskvideo/norsk-studio/lib/extension/base-nodes';

import { OnCreated, RuntimeUpdates, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';

import express, { Response } from 'express';
import { ChannelSummary, DescribeChannelCommand, DescribeInputCommand, DescribeInputCommandOutput, ListChannelsCommand, MediaLiveClient, MediaLiveServiceException } from '@aws-sdk/client-medialive';
import { warninglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { ListOriginEndpointsCommand, MediaPackageClient } from '@aws-sdk/client-mediapackage';


export type MediaLiveConfig = {
  id: string,
  displayName: string,

  // The channel to publish to
  channelId: string

  // the id of the input on that channel
  inputId: string,

  // the index of the destination within that input
  // in which we'll find out RTP details
  destinationIndex: number
}

export type MediaLiveState = {
  url?: string
}

export type MediaLiveEvent = {
  type: 'url-located',
  url: string
}

export type MediaLiveCommand = object;

export default class MediaConnectSourceDefinition implements ServerComponentDefinition<MediaLiveConfig, MediaLiveOutput, MediaLiveState, MediaLiveCommand, MediaLiveEvent> {
  async create(norsk: Norsk, cfg: MediaLiveConfig, cb: OnCreated<MediaLiveOutput>, { updates }: StudioRuntime<MediaLiveState, MediaLiveCommand, MediaLiveEvent>) {
    const node = await MediaLiveOutput.create(norsk, cfg, updates);
    cb(node);
  }

  routes() {
    const router = express.Router()
    router.get("/channels", async (_req, res) => {
      let channels: ChannelSummary[] = [];

      try {
        const client = new MediaLiveClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
        const response = await client.send(new ListChannelsCommand({ MaxResults: 100 }));
        channels = response.Channels ?? [];
        client.destroy();
      } catch (e) {
        handleAwsException(e, res);
        return;
      }
      res.send(JSON.stringify(channels));
    })

    router.get('/inputs/:id', async (req, res) => {
      let input: DescribeInputCommandOutput | undefined = undefined;
      try {
        const client = new MediaLiveClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
        input = await client.send(new DescribeInputCommand({ InputId: req.params.id }));
        client.destroy();
      } catch (e) {
        handleAwsException(e, res);
        return;
      }
      if (!input) {
        res.status(404).send("Input not found?");
        return;
      }
      res.send(JSON.stringify(input));
    })

    return router;
  }
}

// 1999 called and asked for its Java back
function handleAwsException(e: unknown, res: Response) {
  if (e instanceof MediaLiveServiceException) {
    res.status(e?.$metadata?.httpStatusCode ?? 500).send(JSON.stringify(e));
  } else {
    res.status(500).send(JSON.stringify(e));
  }
}

export class MediaLiveOutput extends CustomSinkNode {
  norsk: Norsk;
  cfg: MediaLiveConfig;
  initialised: Promise<void>;
  updates: RuntimeUpdates<MediaLiveState, MediaLiveCommand, MediaLiveEvent>;

  static async create(norsk: Norsk, cfg: MediaLiveConfig, updates: RuntimeUpdates<MediaLiveState, MediaLiveCommand, MediaLiveEvent>) {
    const node = new MediaLiveOutput(cfg, norsk, updates);
    await node.initialised;
    return node;
  }

  constructor(cfg: MediaLiveConfig, norsk: Norsk, updates: RuntimeUpdates<MediaLiveState, MediaLiveCommand, MediaLiveEvent>) {
    super(cfg.id);
    this.norsk = norsk;
    this.cfg = cfg;
    this.initialised = this.initialise();
    this.updates = updates;
  }

  async initialise() {
    let input: DescribeInputCommandOutput | undefined = undefined;

    try {
      const client = new MediaLiveClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
      input = await client.send(new DescribeInputCommand({ InputId: this.cfg.inputId }));
      client.destroy();
    } catch (e) {
      console.error("Failed to retrieve input information from AWS, cannot start media node");
      return;
    }

    const url = input?.Destinations?.[this.cfg.destinationIndex];

    if (!input || !url) {
      console.error("Failed to load channel and input details, cannot start node", this.id, this.cfg);
      return;
    }

    if (!url.Ip) {
      console.error("No IP address on input, cannot start", this.id, this.cfg);
      return;
    }

    if (!url.Port) {
      console.error("No listener port on flow output, cannot start", this.id, this.cfg);
      return;
    }

    // Just assume RTP for now
    const udp = await this.norsk.output.udpTs({
      id: `${this.id}-udpTs`,
      destinationIp: url.Ip,
      port: parseInt(url.Port, 10),
      interface: 'any',
      rtpEncapsulate: true,
      bufferDelayMs: 5000.0,
      avDelayMs: 50.0, // with a buffer delay this is really just for ancillary
    })
    this.setup({ sink: udp }, { requireOneOfEverything: true });
    void this.loadOutputInformation();
  }

  async loadOutputInformation() {
    const client = new MediaLiveClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
    const packageClient = new MediaPackageClient({ region: process.env.AWS_REGION ?? "eu-west-2" });
    const result = await client.send(new DescribeChannelCommand({ ChannelId: this.cfg.channelId }))
    const mediaPackageChannel = result?.Destinations?.[0]?.MediaPackageSettings?.[0]?.ChannelId;

    if (!mediaPackageChannel) {
      warninglog("Failed to locate media package for medialive output, no preview is available");
      return;
    }

    const result2 = await packageClient.send(new ListOriginEndpointsCommand({ ChannelId: mediaPackageChannel }));
    const url = result2.OriginEndpoints?.[0]?.Url

    if (!url) {
      warninglog("No URL available for media package, no preview is available");
      return;
    }
    this.updates.raiseEvent({ type: 'url-located', url })
  }

  override async close() {
    await super.close();
  }
}

