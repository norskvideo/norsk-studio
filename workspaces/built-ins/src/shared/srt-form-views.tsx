import type { SocketOptions } from "./srt-types";

export function SocketConfiguration(options: SocketOptions) {
  const show = (n?: number) => n !== undefined && !Number.isNaN(n) ? n.toString() : "";
  return (<div className="grid grid-flow-row-dense grid-cols-3 text-sm">
    <div className="col-span-1">Receive Latency</div>
    <div className="col-span-2">{show(options.receiveLatency)}</div>

    <div className="col-span-1">Peer Latency</div>
    <div className="col-span-2">{show(options.peerLatency)}</div>

    <div className="col-span-1">Input Bandwidth</div>
    <div className="col-span-2">{show(options.inputBandwidth)}</div>

    <div className="col-span-1">Overhead Bandwidth</div>
    <div className="col-span-2">{show(options.overheadBandwidth)}</div>

    <div className="col-span-1">Max Bandwidth</div>
    <div className="col-span-2">{show(options.maxBandwidth)}</div>
  </div >)
}

