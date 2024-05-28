import { useEffect, useRef, useState } from "react";
import type { ActionReplayState, ActionReplayConfig, ActionReplayCommand } from "./runtime";
import Hls from 'hls.js';

let changingDuration = false;

function InlineView({ state, config, sendCommand }: { state: ActionReplayState, config: ActionReplayConfig, sendCommand: (cmd: ActionReplayCommand) => void }) {
  const url = state.contentPlayerUrl;
  const id = config.id;
  const previewVideo = useRef<HTMLVideoElement>(null)

  const [lastSeek, setLastSeek] = useState<undefined | { time: number, end: number }>(undefined);
  const [playbackDuration, setPlaybackDuration] = useState(10);

  useEffect(() => {
    if (!url) return;
    if (!previewVideo.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(previewVideo.current);
    }
    else if (previewVideo.current.canPlayType('application/vnd.apple.mpegurl')) {
      previewVideo.current.src = url;
    }
  }, [state.contentPlayerUrl]);

  if (!url) return <>...</>

  return <div className="mb-5">
    <h5>Preview</h5>
    <video
      ref={previewVideo}
      controls={true}
      onSeeked={onSeeked}
      autoPlay={true}
      muted={true}
      className={state.replaying ? "hidden" : ""}
      id={`${id}-video`}>
    </video>
    {state.replaying ? <>Current Performing Replay</> :
      <>

        {lastSeek ?
          <>
            <p>Replay from {lastSeek.time.toFixed(1)}(s) </p>
            <p className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Duration: {playbackDuration}s</p>
            <input id="duration-range" type="range" min={currentMinDuration()} max={currentMaxDuration()} defaultValue={playbackDuration} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" onChange={onDurationChange} onInput={onDurationChange} />
          </>
          :
          <></>}
        <button onClick={sendReplayCommand} type="button" className="mt-2 mb-2 text-white w-full justify-center bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800" >
          Replay
        </button>
      </>
    }
  </div >

  // function previewCut() {
  //   changingDuration = true;
  //   if (previewVideo.current && lastSeek?.time) {
  //     changingDuration = true;
  //     previewVideo.current.currentTime = lastSeek.time;
  //   }
  // }

  function sendReplayCommand() {
    if (!previewVideo.current) return;
    if (!lastSeek) return;

    const fromHead = previewVideo.current.duration - lastSeek.time;
    sendCommand({
      type: "do-replay",
      from: fromHead,
      duration: playbackDuration
    })
  }

  function onDurationChange(e: React.FormEvent<HTMLInputElement>) {
    const v = parseInt(e.currentTarget.value, 10);
    setPlaybackDuration(v);
  }

  function currentMinDuration() {
    if (!previewVideo.current || !lastSeek) return 10;
    return Math.min(10, previewVideo.current.duration - lastSeek.time)
  }

  function currentMaxDuration() {
    if (!previewVideo.current || !lastSeek) return 30;
    return Math.min(30, previewVideo.current.duration - lastSeek.time)
  }

  function onSeeked() {
    if (changingDuration) {
      changingDuration = false;
      return;
    }
    const v = previewVideo.current;
    if (v?.currentTime && v.duration)
      setLastSeek({ time: v?.currentTime, end: v?.duration })
    else
      setLastSeek(undefined);
  }
}

export default InlineView;
