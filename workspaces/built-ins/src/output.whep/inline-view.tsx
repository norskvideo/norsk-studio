import { useEffect, useState } from "react";
import type { WhepOutputState, WhepOutputSettings } from "./runtime";
import { WhepClient } from "@norskvideo/webrtc-client";
import type { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";

function InlineView({ state, config, raise }: ViewProps<WhepOutputSettings, WhepOutputState>) {
  const url = state.url;
  const id = config.id;
  const [showPreview, setShowPreview] = useState(config.showPreview ?? true);
  const [client, setClient] = useState<WhepClient | null>(null);

  const createClient = (url: string) => {
    const newClient = new WhepClient({
      url,
      container: document.getElementById(`whep-${id}`) ?? undefined,
    });
    newClient.start().catch(console.error);
    return newClient;
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

  useEffect(() => {
    if (!url || !showPreview) {
      if (client) {
        cleanupClient(client);
        setClient(null);
      }
      return;
    }

    const newClient = createClient(url);
    setClient(newClient);

    return () => {
      cleanupClient(newClient);
    };
  }, [state.url, showPreview]);

  useEffect(() => {
    setShowPreview(config.showPreview ?? true);
  }, [config.showPreview]);

  raise && useEffect(raise, []);

  if (!url) return <>...</>;

  const videoStyles = `
    #whep-${id} video::-webkit-media-controls-play-button { 
      display: none; 
    }
  `;

  return (
    <div className="whep-container">
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
        <div className="whep-video" id={`whep-${id}`}> 
          <style>{videoStyles}</style>
        </div>
      ) : (
        <div className="whep-video bg-black flex items-center justify-center text-white h-full">
          Preview turned off
        </div>
      )}
    </div>
  );
}

export default InlineView;