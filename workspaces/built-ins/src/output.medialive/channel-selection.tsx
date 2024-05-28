import { ChangeEvent, useEffect, useState } from "react";

import type { MediaLiveConfig } from "./runtime";
import type { ChannelSummary } from "@aws-sdk/client-medialive";

type ChannelSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latest: Partial<MediaLiveConfig>
}

function ChannelSelection(props: ChannelSelectionProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = async () => {
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

  const [channels, setChannels] = useState<ChannelSummary[]>([]);

  if (loading) {
    return <div>Loading..</div>
  }

  if (channels.length == 0) {
    return <div>No channels loaded</div>
  }

  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value=''>---</option>
      {channels.map((o, i) => {
        const val = o.Id;
        return <option key={i} value={val}>{o.Name}</option>
      })}
    </select>
  </div>


  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(e.target.value);
  }
}

export default ChannelSelection;
