import type { AutoCmafAkamaiDestination, AutoCmafS3Destination, AutoCmafSegment } from "./runtime";

export function S3Destination(destination: AutoCmafS3Destination) {
  return <div className="grid grid-flow-row-dense grid-cols-3 text-sm">
    <div className="col-span-1">Host</div>
    <div className="col-span-2">{destination.host}</div>

    <div className="col-span-1">Path</div>
    <div className="col-span-2">{destination.prefix}</div>

    <div className="col-span-1">Include Ads</div>
    <div className="col-span-2">{destination.includeAdInsertions ? 'yes' : 'no'}</div>
  </div >
}

export function AkamaiDestination(destination: AutoCmafAkamaiDestination) {
  return <div className="grid grid-flow-row-dense grid-cols-3 text-sm">
    <div className="col-span-1">Stream ID</div>
    <div className="col-span-2">{destination.streamId}</div>


    <div className="col-span-1">Event Name</div>
    <div className="col-span-2">{destination.eventName}</div>
  </div >
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

