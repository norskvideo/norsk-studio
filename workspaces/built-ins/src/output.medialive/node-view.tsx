import type { NodeDescription } from "norsk-studio/lib/shared/document";
import type { MediaLiveConfig } from "./runtime";
import type { ChannelSummary, DescribeInputCommandOutput } from "@aws-sdk/client-medialive";

import { useEffect, useState } from "react";

function NodeView(props: { node: NodeDescription<MediaLiveConfig> }) {
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<ChannelSummary | undefined>(undefined);
  const [input, setInput] = useState<DescribeInputCommandOutput | undefined>(undefined);

  useEffect(() => {
    if (!props.node.config.channelId) return;
    if (!props.node.config.inputId) return;

    const fn = async () => {
      const channels = await fetch('components/output.medialive/channels').then(async (f) => f.json()) as ChannelSummary[]
      const input = await fetch('components/output.medialive/inputs/' + props.node.config.inputId).then(async (f) => f.json()) as DescribeInputCommandOutput;
      const channel = channels.find((c) => c.Id == props.node.config.channelId);
      setChannel(channel);
      setInput(input);

      setLoading(false);
    }
    fn().catch(console.error);
  }, [props.node.config.channelId, props.node.config.inputId])

  if (loading) {
    return <div>...</div>
  }

  if (!channel) {
    return <div>[Error: Failed to load channel]</div>
  }

  if (!input) {
    return <div>[Error: Missing input on channel]</div>
  }

  return <div>
    <div>Name: {channel.Name}</div>
    <div>Input: {input.Name}</div>
    <div>Url: {input.Destinations?.[props.node.config.destinationIndex].Url}</div>
  </div>
}

export default NodeView;
