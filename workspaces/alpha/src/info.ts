//
// This file is generated by studio-wrap-infos
// Do not edit by hand
//
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

import processor_actionReplay from "./processor.actionReplay/info";
AllComponents.push((r: Registration) => processor_actionReplay(r) as unknown as NodeInfo<BaseConfig>);
import processor_audioLevel from "./processor.audioLevel/info";
AllComponents.push((r: Registration) => processor_audioLevel(r) as unknown as NodeInfo<BaseConfig>);
import processor_audioMixer from "./processor.audioMixer/info";
AllComponents.push((r: Registration) => processor_audioMixer(r) as unknown as NodeInfo<BaseConfig>);
import processor_monetise from "./processor.monetise/info";
AllComponents.push((r: Registration) => processor_monetise(r) as unknown as NodeInfo<BaseConfig>);
import processor_whisper_transcribe from "./processor.whisper-transcribe/info";
AllComponents.push((r: Registration) => processor_whisper_transcribe(r) as unknown as NodeInfo<BaseConfig>);
import util_stats_ma35d from "./util.stats.ma35d/info";
AllComponents.push((r: Registration) => util_stats_ma35d(r) as unknown as NodeInfo<BaseConfig>);
import util_timestamps from "./util.timestamps/info";
AllComponents.push((r: Registration) => util_timestamps(r) as unknown as NodeInfo<BaseConfig>);
