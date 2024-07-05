import { ChangeEvent, useEffect, useState } from "react";

import type { MediaConnectConfig } from "./runtime";
import type { ListedFlow } from "@aws-sdk/client-mediaconnect";

type FlowSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latest: Partial<MediaConnectConfig>
}

function FlowSelection(props: FlowSelectionProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fn = async () => {
      const result = await fetch('components/input.mediaconnect/flows')
      if (result.ok && result.body) {
        const flows = await result.json() as ListedFlow[];
        setFlows(flows);
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

  const [flows, setFlows] = useState<ListedFlow[]>([]);

  if (loading) {
    return <div>Loading..</div>
  }

  if (flows.length == 0) {
    return <div>No flows loaded</div>
  }

  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value=''>---</option>
      {flows.map((o, i) => {
        const val = o.FlowArn;
        return <option key={i} value={val}>{/*o.Name*/}-{o.Description}</option>
      })}
    </select>
  </div>


  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(e.target.value);
  }
}

export default FlowSelection;
