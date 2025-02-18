import type { AutoCmafDestination, AutoCmafSegment } from "./runtime";

export function Destination(destination: AutoCmafDestination) {
  switch (destination.type) {
    case "s3":
      return <div className="grid grid-flow-row-dense grid-cols-3 text-sm">
        <div className="col-span-1">Host</div>
        <div className="col-span-2">{destination.host}</div>

        <div className="col-span-1">Path</div>
        <div className="col-span-2">{destination.prefix}</div>

        <div className="col-span-1">Include Ads</div>
        <div className="col-span-2">{destination.includeAdInsertions ? 'yes' : 'no'}</div>
      </div >
    case "akamai":
      return <div className="grid grid-flow-row-dense grid-cols-3 text-sm">
        <div className="col-span-1">Ingest</div>
        <div className="col-span-2">{destination.ingest}</div>

        <div className="col-span-1">Playback</div>
        <div className="col-span-2">{destination.playback}</div>

        <div className="col-span-1">Include Ads</div>
        <div className="col-span-2">{destination.includeAdInsertions ? 'yes' : 'no'}</div>
      </div >
    default: {
      const _: never = destination;
      console.log('Unreachable');
      return <></>
    }


  }
}

export function SegmentConfiguration(cfg: AutoCmafSegment) {
  return <div className="grid grid-flow-row-dense grid-cols-3 text-sm">
    <div className="col-span-1">Segments</div>
    <div className="col-span-2">{cfg.defaultSegmentCount == 0 ? "all" : cfg.defaultSegmentCount}</div>

    <div className="col-span-1">Segment Target</div>
    <div className="col-span-2">{cfg.targetSegmentDuration}s</div>

    <div className="col-span-1">Part Target</div>
    <div className="col-span-2">{cfg.targetPartDuration}s</div>

    <div className="col-span-1">Retention</div>
    <div className="col-span-2">{cfg.retentionPeriod}s</div>
  </div >
}

