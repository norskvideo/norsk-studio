import { ChangeEvent, useEffect, useState } from "react";

import type { MediaConnectConfig } from "./runtime";
import type { Flow } from "@aws-sdk/client-mediaconnect";

type OutputSelectionProps = {
  defaultValue?: string,
  id: string,
  onChanged: (value: string) => void,
  latest: Partial<MediaConnectConfig>
}

function OutputSelection(props: OutputSelectionProps) {
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<Flow | undefined>(undefined);

  useEffect(() => {
    const fn = async () => {
      setLoading(true);
      if (props.latest.flowArn) {
        const result = await fetch('components/input.mediaconnect/flows/' + props.latest.flowArn)
        if (result.ok && result.body) {
          const flow = await result.json() as Flow;
          setFlow(flow);
          setLoading(false);
          const firstOutput = flow.Outputs?.[0]?.OutputArn;
          if (firstOutput && flow.Outputs?.length == 1 && firstOutput !== props.defaultValue) {
            props.onChanged(firstOutput);
          }
          else if (props.defaultValue) {
            props.onChanged(props.defaultValue);
          }
        } else {
          const text = await result.text();
          throw new Error(text);
        }
      }
    }
    fn().catch(console.error);
  }, [props.latest.flowArn])


  if (loading) {
    return <div>...</div>
  }

  if (flow == undefined) {
    return <div>...</div>
  }

  if (!flow.Outputs) {
    return <div>Flow has no outputs</div>
  }

  const firstOutput = flow.Outputs?.[0]?.OutputArn;

  if (firstOutput && flow.Outputs.length == 1) {
    return <div>{flow.Outputs[0].ListenerAddress ?? ''}:{flow.Outputs[0].Port ?? 0}</div>
  }

  return <div>
    <select defaultValue={props.defaultValue} className={`node-editor-select-input`} id={props.id} onChange={myOnChange} onBlur={myOnChange}>
      <option key="empty" value="">---</option>
      {flow.Outputs.map((o, i) => {
        const val = o.OutputArn
        return <option key={i} value={val}>{o.Name}-{o.Description}</option>
      })}
    </select>
  </div>

  function myOnChange(e: ChangeEvent<HTMLSelectElement>) {
    props.onChanged(e.target.value);
  }
}

export default OutputSelection;
