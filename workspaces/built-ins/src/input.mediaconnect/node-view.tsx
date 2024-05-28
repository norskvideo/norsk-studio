import { useEffect, useState } from "react";
import type { MediaConnectConfig } from "./runtime";
import type { Flow } from "@aws-sdk/client-mediaconnect";
import type { NodeDescription } from "norsk-studio/lib/shared/document";


function NodeView(props: { node: NodeDescription<MediaConnectConfig> }) {
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<Flow | undefined>(undefined);

  useEffect(() => {
    if (!props.node.config.flowArn) return;
    const fn = async () => {
      const result = await fetch('components/input.mediaconnect/flows/' + props.node.config.flowArn)
      if (result.ok && result.body) {
        const flow = await result.json() as Flow;
        setFlow(flow);
        setLoading(false);
      } else {
        const text = await result.text();
        throw new Error(text);
      }
    }
    fn().catch(console.error);
  }, [props.node.config.flowArn])

  const output = flow?.Outputs?.find((o) => o.OutputArn == props.node.config.outputArn);

  if (loading) {
    return <div>...</div>
  }

  if (!flow) {
    return <div>[Error: Failed to load flow]</div>
  }

  if (!output) {
    return <div>[Error: Missing output on flow]</div>
  }

  return <div>
    <div>Name: {flow.Name}</div>
    <div>Description: {flow.Description}</div>
    <div>Protocol: {output.Transport?.Protocol}</div>
    <div>Address: {output.ListenerAddress}</div>
    <div>Port: {output.Port}</div>
  </div>
}

export default NodeView;
