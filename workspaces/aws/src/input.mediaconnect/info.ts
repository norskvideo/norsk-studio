import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { MediaConnectConfig } from "./runtime";
import React from "react";

export default function({ defineComponent, Av, validation: { Z } }: Registration) {
  const FlowSelection = React.lazy(async () => import('./flow-selection'));
  const OutputSelection = React.lazy(async () => import('./output-selection'));
  const NodeView = React.lazy(async () => import('./node-view'));

  return defineComponent<MediaConnectConfig>({
    identifier: 'input.mediaconnect',
    category: 'input',
    name: "Media Connect Input",
    description: "Allows for integration with AWS Elemental MediaConnect, enabling users to ingest media flows from the cloud into their processing pipeline.",
    subscription: {
      produces: {
        type: "single-stream", // for now anyway
        media: Av
      }
    },
    designtime: {
      node: NodeView
    },
    configForm: {
      form: {
        flowArn: {
          help: "The flow to connect to",
          hint: {
            type: "custom",
            component: FlowSelection,
            validation: Z.string().min(1, "Choosing a flow is mandatory")
          }
        },
        outputArn: {
          help: "Output of the flow to be used",
          hint: {
            type: "custom",
            component: OutputSelection,
            validation: Z.string().min(1, "Choosing an output is mandatory")
          }
        },
        notes: { 
          help: "Additional notes about this component", 
          hint: { type: 'text', optional: true } 
        },
      }
    }
  });
}

