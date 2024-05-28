import { Norsk, OnStreamResult, RtmpServerInputSettings as SdkSettings, RtmpServerStreamKeys } from '@norskvideo/norsk-sdk';
import { SimpleInputWrapper } from 'norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition, StudioRuntime } from 'norsk-studio/lib/extension/runtime-types';
import { debuglog } from 'norsk-studio/lib/server/logging';

export type RtmpInputSettings = Pick<SdkSettings
  , 'port'
  | 'ssl'>
  & {
    id: string,
    displayName: string,
    appName: string,
    streamNames: string[],
  };

export type RtmpInputState = {
  connectedSources: string[]
}

export type RtmpInputEvent = {
  type: "source-connected" | "source-disconnected",
  streamName: string,
}

export default class RtmpInputDefinition implements ServerComponentDefinition<RtmpInputSettings, SimpleInputWrapper, RtmpInputState> {
  async create(norsk: Norsk, cfg: RtmpInputSettings, cb: OnCreated<SimpleInputWrapper>, { updates }: StudioRuntime<RtmpInputState, RtmpInputEvent>) {
    let activeStreams: string[] = [];
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {
      return await norsk.input.rtmpServer({
        port: cfg.port,
        ssl: cfg.ssl,
        sslOptions: {
          certFile: process.env.SSL_CERT_FILE,
          keyFile: process.env.SSL_KEY_FILE,
        },
        onConnection(connectionId: string, app: string, url: string) {
          if (app === cfg.appName) {
            debuglog("Accepted connection with app name", { app, connectionId, url });
            return { accept: true };
          } else {
            debuglog("Rejecting connection with unknown app name", { app, connectionId, url });
            return { accept: false };
          }
        },
        onStream(
          cid: string,
          app: string,
          url: string,
          streamId: number,
          publishingName: string
        ): OnStreamResult {
          if (cfg.streamNames.includes(publishingName)) {
            if (activeStreams.includes(publishingName)) {
              debuglog("Rejecting connection as no stream names left to assign", { app, publishingName, streamId, url, cid });
              return {
                accept: false,
                reason: "No stream names left to assign"
              }
            }
            debuglog("Accepted stream", { app, publishingName, streamId, url, cid })
            activeStreams.push(publishingName)
            updates.raiseEvent({ type: "source-connected", streamName: publishingName })
            return {
              accept: true,
              videoStreamKey: {
                renditionName: cfg.appName + "-default",
                sourceName: publishingName,
              },
              audioStreamKey: {
                renditionName: cfg.appName + "-default",
                sourceName: publishingName,
              },
            };
          }
          debuglog("Rejecting connection with unknown stream name", { app, streamId, publishingName });
          return {
            accept: false,
            reason: "Unknown stream name"
          }
        },
        onConnectionStatusChange(
          _cid: string,
          status: string,
          streamKeys: RtmpServerStreamKeys
        ) {
          if (status !== "disconnected") {
            return;
          }
          for (const key of streamKeys) {
            if (key.videoStreamKey.sourceName) {
              const streamName = key.videoStreamKey.sourceName.sourceName
              activeStreams = activeStreams.filter((s) => s !== streamName)
              updates.raiseEvent({ type: "source-disconnected", streamName })
            }

          }
        }
      })
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
