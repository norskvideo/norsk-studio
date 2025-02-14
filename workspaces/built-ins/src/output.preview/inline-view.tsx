import { useEffect, useState } from "react";
import type { PreviewOutputState, PreviewOutputSettings } from "./runtime";

import { WhepClient } from "@norskvideo/webrtc-client";
import type { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";

function InlineView({ state, config, raise }: ViewProps<PreviewOutputSettings, PreviewOutputState>) {
  const url = state.url;
  const id = config.id;
  const [showPreview, setShowPreview] = useState(config.showPreview ?? true);
  const [client, setClient] = useState<WhepClient | null>(null);

  const createClient = (url: string) => {
    const client = new WhepClient({
      url,
      container: document.getElementById(`preview-${id}`) ?? undefined,
    });
    client.start().catch(console.error);
    return client;
  };

  const cleanupClient = (client: WhepClient) => {
    client.outputVideoTracks.forEach(track => track.stop());
    if (client.outputAudioTrack) {
      client.outputAudioTrack.stop();
    }

    client.videoElements.forEach(video => {
      video.srcObject = null;
      video.remove();
    });
  };

  const [loadedImage, setLoadedImage] = useState<HTMLElement | undefined>(undefined);

  useEffect(() => {
    const container = document.getElementById(`preview-${id}`) ?? undefined
    if (!container) return;
    container.innerHTML = '';
    if (loadedImage) {
      container.appendChild(loadedImage);
    }
  }, [loadedImage])

  useEffect(() => {
    if (!url || !showPreview) {
      if (client) {
        cleanupClient(client);
        setClient(null);
      }
      return;
    }
    if (config.previewMode == "image") {
      const container = document.getElementById(`preview-${id}`) ?? undefined
      if (!container) return;

      const img = document.createElement('img')
      img.width = 420;
      img.height = 236;

      // By doing this we effectively  remove flickering
      img.onload = () => {
        setLoadedImage(img);
      }
      img.src = url;
    } else {
      const newClient = createClient(url);
      setClient(newClient);

      return () => {
        cleanupClient(newClient);
      }
    }
  }, [state.url, showPreview]);

  useEffect(() => {
    setShowPreview(config.showPreview ?? true);
  }, [config.showPreview]);

  raise && useEffect(raise, []);

  if (!url) return <>...</>;

  function percentage(levels: { peak: number; rms: number } | undefined) {
    if (!levels) {
      return 0;
    }

    // Rebase to 0-(-112)
    const rebase = levels.rms - 12.0;

    // Percentage ish
    const capped = 0 - rebase / 112;

    // Percentage snapped
    const snapped = Math.floor(capped * 10.0) * 10;

    return Math.max(0, 100 - snapped);
  }

  return (
    <div className="preview-outer-container">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          id={`video-toggle-${id}`}
          checked={showPreview}
          onChange={(e) => setShowPreview(e.target.checked)}
          className="h-4 w-4"
        />
        <label htmlFor={`video-toggle-${id}`} className="text-sm">
          Show Preview
        </label>
      </div>
      {showPreview ? (
        <div className="preview-video" id={`preview-${id}`}>
          <style>
            {`
            #preview-${id} video::-webkit-media-controls-play-button { display: none; },
          `}
          </style>
        </div>
      ) : (
        <div className="preview-video bg-black flex items-center justify-center text-white h-full">
          Preview turned off
        </div>
      )}
      <div className="preview-levels">
        <div
          className={`preview-level clip-${percentage(state.levels)}-preview`}
        ></div>
      </div>
    </div>
  );
}

export default InlineView;
