import { Norsk, SrtInputSettings as SdkSettings } from '@norskvideo/norsk-sdk';
import { SocketOptions } from '../shared/srt-types';
import { SimpleInputWrapper } from '@norskvideo/norsk-studio/lib/extension/base-nodes';
import { OnCreated, ServerComponentDefinition, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';

export type SrtInputSettings = Pick<SdkSettings
  , 'port'
  | 'ip'
  | 'passphrase'>
  & {
    id: string,
    displayName: string,

    // We'll either only allow the stream ids provided
    // or we'll assign them automatically by index
    sourceNames: 'permissive' | 'strict',
    streamIds: string[],
    socketOptions: SocketOptions
  };

export type SrtInputState = {
  connectedStreams: string[]
}

export type SrtInputEvent = {
  type: "source-connected", streamId: string
} |
{ type: "source-disconnected", streamId: string }

export default class SrtInputDefinition implements ServerComponentDefinition<SrtInputSettings, SimpleInputWrapper, SrtInputState> {
  async create(norsk: Norsk, cfg: SrtInputSettings, cb: OnCreated<SimpleInputWrapper>, { updates }: StudioRuntime<SrtInputState, object, SrtInputEvent>) {
    const wrapper = new SimpleInputWrapper(cfg.id, async () => {

      // This could be runtime state
      // and reportable to the client..
      const activeStreams = new Map<string, number>();
      return await norsk.input.srt({
        mode: 'listener',
        sourceName: 'unused',
        onConnectionStatusChange(status, sourceName) {
          switch (status) {
            case 'disconnected':
              if (sourceName) {
                debuglog("Stream with source name has disconnected, clearing it ", { sourceName });
                activeStreams.delete(sourceName);
                updates.raiseEvent({ type: "source-disconnected", streamId: sourceName })
              }
              break;
            default:
              assertUnreachable(status)
          }
        },
        onConnection: (streamId, index, remoteHost) => {
          if (cfg.sourceNames == 'permissive') {
            if (cfg.streamIds.includes(streamId) && !activeStreams.has(streamId)) {
              debuglog("Accepting SRT connection", { streamId, remoteHost })
              activeStreams.set(streamId, index);
              updates.raiseEvent({ type: "source-connected", streamId })
              return {
                accept: true,
                sourceName: streamId
              }
            }
            const streamName = cfg.streamIds.find((s) => !activeStreams.has(s));
            if (!streamName) {
              debuglog("Rejecting connection as no stream ids left to assign", { count: index, remoteHost });
              return {
                accept: false
              }
            }
            debuglog("Accepting SRT connection", { streamName, remoteHost })
            updates.raiseEvent({ type: "source-connected", streamId: streamName })
            activeStreams.set(streamName, index);
            return {
              accept: true,
              sourceName: streamName
            }
          } else {
            if (cfg.streamIds.includes(streamId)) {
              debuglog("Accepting SRT connection", { streamId, remoteHost })
              activeStreams.set(streamId, index);
              return {
                accept: true,
                sourceName: streamId
              }
            }
            debuglog("Rejecting connection with unknown streamId", { streamId, remoteHost });
            return {
              accept: false
            }

          }
        },
        ...cfg
      });
    })
    await wrapper.initialised;
    cb(wrapper);
  }
}
