import type Registration from "@norskvideo/norsk-studio/lib/extension/registration"
import type { NdiInputSettings } from "./runtime"
import React from "react";

export default function({
  defineComponent,
  Av, validation: { Z }}: Registration) {
  const SourceSelection = React.lazy(async () => import('./source-selection'));

  return defineComponent<NdiInputSettings>(
    {
      identifier: 'input.ndi',
      category: 'input',
      name: "NDI ingest",
      description: "This component ingests from an NDI source.",
      subscription: {
        accepts: undefined,
        produces: {
          type: "single-stream",
          media: Av
        }
      },
      display: (desc) => {
        return {
          ndiSourceName: desc.config.ndiSourceName,
          ndiReceiveName: desc.config.ndiReceiveName
        }
      },
      configForm: {
        form: {
          ndiSourceName: {
            help: "The source to connect to",
            hint: {
              type: "custom",
              component: SourceSelection,
              validation: Z.string().min(1, "Choosing a source is mandatory")
            }
          },
          // ndiSourceName: { help: "The NDI source to receive from", hint: { type: "text"}},
          ndiReceiveName: { help: "The name to publish this receiver as", hint: { type: "text"}},
        }
      }
    });
}

