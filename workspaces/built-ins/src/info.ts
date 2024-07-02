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
import input_rtmp from "./input.rtmp/info";
AllComponents.push((r: Registration) => input_rtmp(r) as unknown as NodeInfo<BaseConfig>);
import input_silence from "./input.silence/info";
AllComponents.push((r: Registration) => input_silence(r) as unknown as NodeInfo<BaseConfig>);
import input_srt_caller from "./input.srt-caller/info";
AllComponents.push((r: Registration) => input_srt_caller(r) as unknown as NodeInfo<BaseConfig>);
import input_srt_listener from "./input.srt-listener/info";
AllComponents.push((r: Registration) => input_srt_listener(r) as unknown as NodeInfo<BaseConfig>);
import input_udp_ts from "./input.udp-ts/info";
AllComponents.push((r: Registration) => input_udp_ts(r) as unknown as NodeInfo<BaseConfig>);
import input_videoTestCard from "./input.videoTestCard/info";
AllComponents.push((r: Registration) => input_videoTestCard(r) as unknown as NodeInfo<BaseConfig>);
import output_autoCmaf from "./output.autoCmaf/info";
AllComponents.push((r: Registration) => output_autoCmaf(r) as unknown as NodeInfo<BaseConfig>);
import output_medialive from "./output.medialive/info";
AllComponents.push((r: Registration) => output_medialive(r) as unknown as NodeInfo<BaseConfig>);
import output_preview from "./output.preview/info";
AllComponents.push((r: Registration) => output_preview(r) as unknown as NodeInfo<BaseConfig>);
import output_rtmp from "./output.rtmp/info";
AllComponents.push((r: Registration) => output_rtmp(r) as unknown as NodeInfo<BaseConfig>);
import output_srt from "./output.srt/info";
AllComponents.push((r: Registration) => output_srt(r) as unknown as NodeInfo<BaseConfig>);
import output_statistics from "./output.statistics/info";
AllComponents.push((r: Registration) => output_statistics(r) as unknown as NodeInfo<BaseConfig>);
import output_udpTs from "./output.udpTs/info";
AllComponents.push((r: Registration) => output_udpTs(r) as unknown as NodeInfo<BaseConfig>);
import output_whep from "./output.whep/info";
AllComponents.push((r: Registration) => output_whep(r) as unknown as NodeInfo<BaseConfig>);
import processor_aws_transcribe from "./processor.aws-transcribe/info";
AllComponents.push((r: Registration) => processor_aws_transcribe(r) as unknown as NodeInfo<BaseConfig>);
import processor_browserOverlay from "./processor.browserOverlay/info";
AllComponents.push((r: Registration) => processor_browserOverlay(r) as unknown as NodeInfo<BaseConfig>);
import processor_cascadingSwitch from "./processor.cascadingSwitch/info";
AllComponents.push((r: Registration) => processor_cascadingSwitch(r) as unknown as NodeInfo<BaseConfig>);
import processor_dynamicBug from "./processor.dynamicBug/info";
AllComponents.push((r: Registration) => processor_dynamicBug(r) as unknown as NodeInfo<BaseConfig>);
import processor_fixedLadder from "./processor.fixedLadder/info";
AllComponents.push((r: Registration) => processor_fixedLadder(r) as unknown as NodeInfo<BaseConfig>);
import processor_whisper_transcribe from "./processor.whisper-transcribe/info";
AllComponents.push((r: Registration) => processor_whisper_transcribe(r) as unknown as NodeInfo<BaseConfig>);
import util_latency from "./util.latency/info";
AllComponents.push((r: Registration) => util_latency(r) as unknown as NodeInfo<BaseConfig>);
import util_ma35d from "./util.ma35d/info";
AllComponents.push((r: Registration) => util_ma35d(r) as unknown as NodeInfo<BaseConfig>);
import util_timestamps from "./util.timestamps/info";
AllComponents.push((r: Registration) => util_timestamps(r) as unknown as NodeInfo<BaseConfig>);
