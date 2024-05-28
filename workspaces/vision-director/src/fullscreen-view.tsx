import { useEffect, useRef, useState } from "react";
import { type MultiCameraSelectState, type MultiCameraSelectConfig, type MultiCameraSelectCommand, type MultiCameraSource } from "./runtime";

import { WhepClient } from '@norskvideo/webrtc-client'

type CreatedClient = {
  source: MultiCameraSource,
  client: WhepClient
}

type State = {
  createdClient: CreatedClient[];
  livePreviewSource: CreatedClient | undefined;
}

async function maybeCreatePlayer(created: CreatedClient[], source: MultiCameraSource, url: string): Promise<CreatedClient[]> {
  if (!created.find((c) => c.source.id == source.id && c.source.key == source.key)) {
    const container = document.getElementById(mkContainerId(source)) || undefined; // TODO Could pass an HTMLElement or what have you to the function
    const client = new WhepClient({ url, container })
    client.videoElements.forEach((e) => {
      e.muted = true;
    })
    await client.start();
    const next = [...created];
    next.push({
      source, client
    })
    return next;
  }
  else {
    return created;
  }
}

function FullScreenView(multiCamera: { state: MultiCameraSelectState, config: MultiCameraSelectConfig, sendCommand: (cmd: MultiCameraSelectCommand) => void }) {
  const [state, setState] = useState<State>({ createdClient: [], livePreviewSource: undefined });
  const refLivePreviewVideo = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const promise = async () => {
      let nextCreated = state.createdClient;
      for (const entry of multiCamera.state.players) {
        nextCreated = await maybeCreatePlayer(nextCreated, entry.source, entry.player);
      }

      if (multiCamera.state.previewPlayerUrl)
        nextCreated = await maybeCreatePlayer(nextCreated, { id: 'preview' }, multiCamera.state.previewPlayerUrl)

      let initialLivePreviewSource;
      if (state.livePreviewSource === undefined) {
        const fallbackSource = nextCreated.find((s) => s.source.id === "fallback")
        if (fallbackSource) {
          initialLivePreviewSource = fallbackSource
        }
      }
      setState({ ...state, createdClient: nextCreated, livePreviewSource: initialLivePreviewSource })

      for (const c of nextCreated) {
        if (!multiCamera.state.players.find((s) => s.source.id == c.source.id && s.source.key == s.source.key)) {
          c.client.videoElements.forEach((e) => {
            e.remove();
          });
          // needs removing from the array!??
        }
        else {
          c.client.videoElements.forEach((e) => {
            console.log("Muting video");
            e.muted = true;
            void e.play();
          })
        }
      }
    }
    void promise().catch((e) => {
      console.error(e);
    })

    // This isn't right, but we don't have a good thing to depend on
    // props change constantly because state gets updated
    // even though the data is the same
    // and we cannot run more than one of these at a time because ooft it goes so so wrong
    // I guess I just need to set pending..
  }, [])

  useEffect(() => {
    if (!state.livePreviewSource) return
    const stream = capture(state.livePreviewSource.client.videoElements[0]); // TODO multiple video elements?
    if (refLivePreviewVideo.current) {
      refLivePreviewVideo.current.srcObject = stream;
      refLivePreviewVideo.current.autoplay = true;
      refLivePreviewVideo.current.controls = false;
    }
  }, [state.livePreviewSource])

  const takeButtonClasses = "text-gray-900 bg-white border border-gray-300 focus:outline-none focus:ring-0 focus:ring-gray-200 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 dark:bg-gray-800 dark:border-gray-600 dark:focus:ring-gray-700 w-full dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:border-gray-600"
  const sourcesSorted =
    multiCamera.state.availableSources.sort(sortSource)
      .reduce<{ fallback: MultiCameraSource | undefined, inputs: MultiCameraSource[] }>(({ fallback, inputs }, s) => {
        if (s.id === "fallback") {
          return { fallback: s, inputs }
        }
        return { fallback, inputs: [...inputs, s] }
      }, { fallback: undefined, inputs: [] })
  if (sourcesSorted.fallback) {
    sourcesSorted.inputs.unshift(sourcesSorted.fallback)
  }
  return <div id="camera-control-container" className="bg-gray-50 dark:bg-gray-900">
    <div className="flex flex-col h-full gap-4 2xl:mx-40 md:mx-6">
      <div id="camera-control-preview-grid" className="mb-6">
        <h2>Camera Control</h2>
        <div className="grid 2xl:grid-cols-5 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 xs:grid-cols-2 grid-rows-1 gap-4">
          {sourcesSorted.inputs.map((s, i) => {
            const isLive = isMultiCameraSourceEqual(s, multiCamera.state.activeSource)
            return <div className="relative" key={i}>
              <div className={`${isLive ? 'border-green-400 border-solid border-2' : ''}`} id={mkContainerId(s)}>
              </div>
              <button
                className={takeButtonClasses}
                onClick={(_e) => { setState({ ...state, livePreviewSource: state.createdClient.find((c) => isMultiCameraSourceEqual(c.source, s)) }) }}
              >
                Preview {s.key ?? s.id}
              </button>
              <div>{isLive ? <span className="absolute top-2 left-2 z-10 px-1 bg-green-300 text-white dark:text-black cursor-default text-xs">Live</span> : <></>}</div>
            </div>
          })}
        </div>
      </div>
      <div id="live-views" className="grid grid-cols-2 gap-4 mb-6">
        <div id="video-live-preview" className="h-full relative 2xl:w-8/12 lg:w-10/12 justify-self-end">
          <video id="video-live" ref={refLivePreviewVideo}></video>
          <button
            className={takeButtonClasses}
            onClick={(_e) => {
              if (state.livePreviewSource) {
                multiCamera.sendCommand({ type: "select-source", source: state.livePreviewSource.source })
              }
            }}
          >
            Take {state.livePreviewSource?.source.key ?? state.livePreviewSource?.source.id}
          </button>
          <div className="absolute top-0 left-0 z-10 ml-2 mt-2 p-2 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white opacity-70">
            Live Preview: <span id="active-source-overlay">{state.livePreviewSource?.source.key ?? state.livePreviewSource?.source.id}</span>
          </div>
        </div>
        <div className="relative 2xl:w-8/12 lg:w-10/12 justify-self-start">
          <div id="preview-container-preview" className="w-full"></div>
          <div className="absolute top-0 left-0 z-10 ml-2 mt-2 p-2 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white opacity-70">
            Live Output: <span id="active-source-overlay">{multiCamera.state.activeSource.key ?? multiCamera.state.activeSource.id}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
}

function sortSource(a: MultiCameraSource, b: MultiCameraSource) {
  const aKey = a.key || ''
  const bKey = b.key || ''
  if (aKey > bKey) return 1
  if (aKey < bKey) return -1
  return 0
}

// TODO Fix the `any` here
// TypeScript didn't play nice with the types
/* eslint-disable  @typescript-eslint/no-explicit-any */
function capture(video: any) {
  if (!video) {
    return
  }
  let stream;
  //  Cannot read properties of undefined (reading 'captureStream')
  if (video.captureStream) {
    stream = video.captureStream(0);
  } else if (video.mozCaptureStream) {
    stream = video.mozCaptureStream(0);
  } else {
    console.error("Stream capture is not supported");
    stream = null;
  }
  return stream;
}

function isMultiCameraSourceEqual(a: MultiCameraSource, b: MultiCameraSource) {
  return a.id === b.id && a.key === b.key
}

function mkContainerId(source: MultiCameraSource) {
  return `preview-container-${source.id}${source.key ? '-' + source.key : ''}`;
}

export default FullScreenView;
