import { AacProfile, SampleRate } from "@norskvideo/norsk-sdk";

export default function CodecConfiguration(cfg:
  {
    kind: 'aac',
    profile: AacProfile,
    sampleRate: SampleRate,
  } | {
    kind: 'opus',
  }) {
  return (<div className="grid grid-flow-row-dense grid-cols-3 text-sm">
    <div className="col-span-1">Codec</div>
    <div className="col-span-2">{cfg.kind}</div>

    {cfg.kind === 'aac' ? <>
    <div className="col-span-1">Profile</div>
    <div className="col-span-2">{cfg.profile}</div>

    <div className="col-span-1">Sample Rate</div>
    <div className="col-span-2">{cfg.sampleRate}</div>
    </> : null}
  </div >)
}

