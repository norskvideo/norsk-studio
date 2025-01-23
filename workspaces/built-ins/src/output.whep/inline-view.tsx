import { useEffect } from "react";
import type { WhepOutputState, WhepOutputSettings } from "./runtime";
import { WhepClient } from "@norskvideo/webrtc-client";
import type { ViewProps } from "@norskvideo/norsk-studio/lib/extension/client-types";

function InlineView({ state, config, raise }: ViewProps<WhepOutputSettings, WhepOutputState>) {
  const url = state.url;
  const id = config.id;

  useEffect(() => {
    if (!url) return;
    const client = new WhepClient({
      url,
      container: document.getElementById(`whep-${id}`) ?? undefined,
    });
    void client.start();
  }, [state.url]);

  raise && useEffect(raise, []);

  if (!url) return <>...</>;

  return (
    <div className="whep-container">
      <div className="whep-video" id={`whep-${id}`} />
    </div>
  );
}

export default InlineView;