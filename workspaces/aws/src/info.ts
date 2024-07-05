import type { BaseConfig, NodeInfo } from "@norskvideo/norsk-studio/lib/extension/client-types";
import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";

const InitialisedComponents: { [key: string]: NodeInfo<BaseConfig> } = {};
let initialised = false;

const AllComponents: ((r: Registration) => NodeInfo<BaseConfig>)[] = [];

export default function getNodeInfo(r: Registration, type: string) {
  if(!initialised) {
    AllComponents.forEach((f) => {
      const i = f(r);
      InitialisedComponents[i.identifier] = i;
    })
    initialised = true;
  }
  return InitialisedComponents[type];
}

import input_mediaconnect from "./input.mediaconnect/info";
AllComponents.push((r: Registration) => input_mediaconnect(r) as unknown as NodeInfo<BaseConfig>);
import output_medialive from "./output.medialive/info";
AllComponents.push((r: Registration) => output_medialive(r) as unknown as NodeInfo<BaseConfig>);
import processor_aws_transcribe from "./processor.aws-transcribe/info";
AllComponents.push((r: Registration) => processor_aws_transcribe(r) as unknown as NodeInfo<BaseConfig>);
