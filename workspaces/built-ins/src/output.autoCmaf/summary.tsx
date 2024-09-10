import { useEffect, useRef } from "react";
import type { CmafOutputState, AutoCmafConfig } from "./runtime";
import Hls from 'hls.js';

function InlineView({ state, config }: { state: CmafOutputState, config: AutoCmafConfig }) {
  const url = state.url;
  const id = config.id;
  const previewVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!url) return;
    if (!previewVideo.current) return;

    if (Hls.isSupported()) {
      let widevineLicenseUrl: string | undefined;
      const headers: Record<string, string | undefined> = {};
      if (config.drmProvider === 'ezdrm') {
        if (config.__global?.ezdrmConfig?.pX || state.drmToken) {
          widevineLicenseUrl = `https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?pX=${config.__global?.ezdrmConfig?.pX || state.drmToken}`;
        }
      }
      if (config.drmProvider === 'axinom') {
        widevineLicenseUrl = `https://drm-widevine-licensing.axprod.net/AcquireLicense`;
        headers['X-AxDrm-Message'] = state.drmToken;
      }

      const hls = new Hls({
        widevineLicenseUrl,
        emeEnabled: !!widevineLicenseUrl,
        licenseXhrSetup: (xhr) => {
          for (const k in headers) {
            const v = headers[k];
            if (v !== undefined) {
              xhr.setRequestHeader(k, v);
            }
          }
        },
      });
      hls.loadSource(url);
      hls.attachMedia(previewVideo.current);
    } else if (previewVideo.current.canPlayType('application/vnd.apple.mpegurl')) {
      previewVideo.current.src = url;
    }
  }, [state.url]);

  if (!url) return <>...</>

  return <div className="mb-5">
    <video ref={previewVideo} autoPlay={true} muted={true} id={`${id}-video`}></video>
  </div >
}

export default InlineView;
