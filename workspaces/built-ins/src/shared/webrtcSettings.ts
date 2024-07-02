import { IceServer } from "@norskvideo/norsk-studio/lib/shared/config";
import { IceServerSettings } from "@norskvideo/norsk-sdk";

export function webRtcSettings(cfg: IceServer[]): {
    iceServers?: IceServerSettings[],
    reportedIceServers?: IceServerSettings[]
} {
    const iceServers = cfg.map((s) =>
        ({ urls: [s.url], username: s.username, credential: s.credential }));
    const reportedIceServers = cfg.filter((s) => s.reportedUrl).map((s) =>
        ({ urls: [s.reportedUrl ?? ''], username: s.username, credential: s.credential }));
    return {
        iceServers: iceServers.length > 0 ? iceServers : undefined,
        reportedIceServers: reportedIceServers.length > 0 ? reportedIceServers : undefined,
    }
}
