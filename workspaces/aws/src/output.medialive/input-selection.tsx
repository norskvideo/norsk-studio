import { ChangeEvent, useEffect, useState } from "react";

import type { MediaLiveConfig } from "./runtime";
import type { ChannelSummary } from "@aws-sdk/client-medialive";

type InputSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latest: Partial<MediaLiveConfig>
}

function inputSelection(props: InputSelectionProps) {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<ChannelSummary[] | undefined>(undefined);
  const [channel, setChannel] = useState<ChannelSummary | undefined>(undefined);

  useEffect(() => {
    console.log("Loading channels for input", props);
    const fn = async () => {
      setLoading(true);
      const result = await fetch('components/output.medialive/channels')
      if (result.ok && result.body) {
        const channels = await result.json() as ChannelSummary[];
        setChannels(channels);
        setLoading(false);

        if (props.defaultValue)
          props.onChanged(props.defaultValue);

      } else {
        const text = await result.text();
        throw new Error(text);
      }
    }
    fn().catch(console.error);
  }, [])

  useEffect(() => {
    const channel = channels?.find((c) => c.Id == props.latest.channelId);
    setChannel(channel);

    const firstInput = channel?.InputAttachments?.[0]?.InputId;
    if (firstInput && channel?.InputAttachments?.length == 1 && firstInput !== props.defaultValue) {
      props.onChanged(firstInput);
    }
  }, [channels, props.latest.channelId])

  if (loading) {
    return <div>...</div>
  }

  if (channel == undefined) {
    return <div>...</div>
  }

  if (!channel.InputAttachments) {
    return <div>Channel has no inputs</div>
  }

  const firstInput = channel.InputAttachments?.[0];

  if (firstInput && channel.InputAttachments.length == 1) {
    return <div>{firstInput.InputAttachmentName}</div>
  }

  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value="">---</option>
      {channel.InputAttachments.map((o, i) => {
        const val = o.InputId;
        return <option key={i} value={val}>{o.InputAttachmentName}</option>
      })}
    </select>
  </div>

  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(e.target.value);
  }
}

export default inputSelection;
