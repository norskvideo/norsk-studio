import { useEffect, useRef, useState } from "react";
import { type MultiCameraSelectState, type MultiCameraSelectConfig, type MultiCameraSelectCommand, type MultiCameraSource } from "./runtime";
import interact from 'interactjs';

import { WhepClient, WhepClientConfig } from '@norskvideo/webrtc-client'

type CreatedClient = {
  source: MultiCameraSource,
  client: MyWhepClient
}

type State = {
  createdClient: CreatedClient[];
  livePreviewSource: CreatedClient | undefined;
}

class MyWhepClient extends WhepClient {
  started: Promise<MediaStream>;
  resolveStartedPromise?: (value: MediaStream | PromiseLike<MediaStream>) => void;
  mediaStream?: MediaStream;
  streamId: string;
  streamKey?: string;

  constructor(config: { streamId: string, streamKey?: string } & WhepClientConfig) {
    super(config)
    this.streamId = config.streamId;
    this.streamKey = config.streamKey;
    this.started = new Promise<MediaStream>((resolve, _reject) => {
      this.resolveStartedPromise = resolve;
      if (this.mediaStream) {
        this.resolveStartedPromise = undefined;
        resolve(this.mediaStream);
      }
    })
  }
  override async handleGotTrack(ev: RTCTrackEvent): Promise<void> {
    if (ev.track.kind == 'video' && ev.streams.length > 0) {
      this.outputVideoTracks.push(ev.track);
    }
    if (ev.track.kind == 'audio') {
      this.outputAudioTrack = ev.track;
    }
    if (this.outputAudioTrack && this.outputVideoTracks.length > this.videoElements.length) {
      for (let i = 0; i < this.outputVideoTracks.length; i++) {
        if (this.videoElements[i]) continue;
        let stream = undefined;
        if (i == 0) {
          stream = new MediaStream([this.outputAudioTrack, this.outputVideoTracks[i]]);
        } else {
          stream = new MediaStream([this.outputVideoTracks[i]]);
        }
        if (this.container) {
          const e = createPlayerElement(stream, this.container);
          this.mediaStream = stream;
          this.videoElements.push(e);
          this.resolveStartedPromise?.(stream);
          e.style.userSelect = 'none';
          e.style.touchAction = 'none';

          e.setAttribute('data-streamid', this.streamId);
          if (this.streamKey)
            e.setAttribute('data-streamkey', this.streamKey);

          let element = undefined as (undefined | HTMLVideoElement);
          let target = undefined as (undefined | HTMLVideoElement);
          interact(e).draggable({
            listeners: {
              start: (e) => {
                element = document.createElement("video");
                element.controls = false;
                element.style.position = 'absolute';
                element.style.left = `${e.page.x}px`
                element.style.top = `${e.page.y}px`
                element.style.width = '100px';
                document.body.appendChild(element);
                element.muted = true;
                element.autoplay = true;
                element.srcObject = stream;
                return true;
              },
              move: (e) => {
                if (element) {
                  element.style.left = `${e.page.x}px`
                  element.style.top = `${e.page.y}px`
                }
                if (e.dragEnter) {
                  target = e.dragEnter;
                }
                if (e.dragLeave && target) {
                  target = undefined;
                }
              }
            }
          }).on('dragend', () => {
            // Can forget about this, it was just a UI thing
            element?.remove();
          })
        }
      }
    }
  }
}

function createPlayerElement(stream: MediaStream, container: HTMLElement) {
  const element = document.createElement("video");
  element.controls = true;
  container.appendChild(element);
  element.muted = true;
  element.autoplay = true;
  element.srcObject = stream;
  return element;
}

async function maybeCreatePlayer(created: CreatedClient[], source: MultiCameraSource, url: string): Promise<CreatedClient[]> {
  if (!created.find((c) => c.source.id == source.id && c.source.key == source.key)) {
    const container = document.getElementById(mkContainerId(source)) || undefined; // TODO Could pass an HTMLElement or what have you to the function
    const client = new MyWhepClient({ url, container, streamId: source.id, streamKey: source.key })
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
        // TODO: what is this?
        if (!multiCamera.state.players.find((s) => s.source.id == c.source.id && s.source.key == s.source.key)) {
          c.client.videoElements.forEach((e) => {
            e.remove();
          });
          // needs removing from the array!??
        }
      }

      if (refLivePreviewVideo.current) {
        interact(refLivePreviewVideo.current)
          .dropzone({
            accept: 'video',
            ondrop: (e) => {
              const video = e.relatedTarget as HTMLVideoElement;
              const streamId = video.getAttribute('data-streamid');
              const streamKey = video.getAttribute('data-streamkey');
              console.log("Dragged and dropped stream", { streamId, streamKey }, e.dragEvent.page.x, e.dragEvent.page.y)

              const targetRect = refLivePreviewVideo.current?.getBoundingClientRect();

              if (targetRect) {
                const relativeX = e.dragEvent.page.x - targetRect?.left;
                const relativeY = e.dragEvent.page.y - targetRect?.top;

                console.log("Relative is ", relativeX, relativeY)
                // Look up the video by the keys
                // create a new element with those details
                // new element will be draggable/droppable/resizeable
                // and control the current model
              }
            }
          })
      }
    }
    void promise().catch((e) => {
      console.error(e);
    })
  }, [])

  useEffect(() => {
    const promise = async () => {
      if (!state.livePreviewSource) return
      await state.livePreviewSource.client.started;
      if (refLivePreviewVideo.current && state.livePreviewSource.client.mediaStream) {
        const ele = refLivePreviewVideo.current;
        refLivePreviewVideo.current.autoplay = true;
        refLivePreviewVideo.current.controls = false;
        refLivePreviewVideo.current.srcObject = state.livePreviewSource.client.mediaStream;
        refLivePreviewVideo.current.oncanplaythrough = () => {
          void ele.play();
        }
      }
    };
    void promise();
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

          {/* I think this is where we be dragging and dropping onto */}
          <video id="video-live" muted autoPlay ref={refLivePreviewVideo}></video>

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

function isMultiCameraSourceEqual(a: MultiCameraSource, b: MultiCameraSource) {
  return a.id === b.id && a.key === b.key
}

function mkContainerId(source: MultiCameraSource) {
  return `preview-container-${source.id}${source.key ? '-' + source.key : ''}`;
}

export default FullScreenView;
