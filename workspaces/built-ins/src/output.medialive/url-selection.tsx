import { ChangeEvent, useEffect, useState } from "react";

import type { MediaLiveConfig } from "./runtime";
import { DescribeInputCommandOutput } from "@aws-sdk/client-medialive";

type UrlSelectionProps = {
  defaultValue?: number,
  id: string,
  onChanged: (value: number) => void,
  latest: Partial<MediaLiveConfig>
}

function UrlSelection(props: UrlSelectionProps) {
  const [loading, setLoading] = useState(true);

  const [input, setInput] = useState<DescribeInputCommandOutput | undefined>(undefined);

  useEffect(() => {
    const fn = async () => {
      setLoading(true);
      if (props.latest.inputId) {
        const result = await fetch('components/output.medialive/inputs/' + props.latest.inputId)
        if (result.ok && result.body) {
          const flow = await result.json() as DescribeInputCommandOutput;
          setInput(flow);
          setLoading(false);
          if (props.defaultValue !== undefined)
            props.onChanged(props.defaultValue);
        } else {
          const text = await result.text();
          throw new Error(text);
        }
      }
    }
    fn().catch(console.error);
  }, [props.latest.inputId])


  if (loading) {
    return <div>...</div>
  }

  if (input == undefined) {
    return <div>...</div>
  }

  if (!input.Destinations) {
    return <div>Input has no destinations</div>
  }
  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value="">---</option>
      {input.Destinations.map((o, i) => {
        return <option key={i} value={i}>{o.Url}</option>
      })}
    </select>
  </div>

  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(parseInt(e.target.value, 10));
  }
}

export default UrlSelection;
