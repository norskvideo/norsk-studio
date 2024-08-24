import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { MultiCameraSelectCommand, MultiCameraSelectConfig, MultiCameraSelectEvent, MultiCameraSelectState } from "./runtime";
import React from "react";
import { GlobalIceServers, HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";
import { OpenAPIV3 } from "openapi-types";
import { Request, Response} from "express";
import { RouteInfo } from "@norskvideo/norsk-studio/lib/extension/client-types";


export const routes: RouteInfo[] = [
  {
    url: '/status',
    method: 'GET',
    handler: (_req: Request, _res: Response) => {},
    payloadSchema: {},
    responseSchema: {
      type: 'object',
      properties: {
        available: {
          type: 'array',
          description: 'List of available video sources',
          items: {
            type: 'object',
            properties: {
              source: { 
                type: 'string', 
                description: 'Unique identifier for the video source',
              },
              resolution: {
                type: 'object',
                description: 'Video resolution details',
                properties: {
                  width: {
                    type: 'number',
                    description: 'Width of the video in pixels',
                  },
                  height: {
                    type: 'number',
                    description: 'Height of the video in pixels',
                  }
                }
              },
              frameRate: {
                type: 'object',
                description: 'Frame rate of the video',
                properties: {
                  frames: {
                    type: 'number',
                    description: 'Number of frames',
                  },
                  seconds: {
                    type: 'number',
                    description: 'Age of the source in seconds',
                  }
                }
              },
              age: { 
                type: 'number',
                description: 'Age of the source in seconds'
              }
            }
          }
        },
        active: { 
          type: 'string',
          description: 'Currently active video source identifier'
        }
      }
    }
  },
  {
    url: '/active',
    method: 'POST',
    handler: (_req: Request, _res: Response) => {},
    payloadSchema: {
      type: 'object',
      properties: {
        source: { 
          type: 'string',
          description: 'Identifier of the source to set as active'
        },
        fadeMs: { 
          type: 'number',
          description: 'Duration of the fade transition in milliseconds (max 1000ms)'
        }
      },
      required: ['source']
    },
    responseSchema: {
      type: 'string',
      description: 'Confirmation message'
    }
  }
];

export function generateOpenApiSpec(routes: RouteInfo[]): OpenAPIV3.Document {
  const paths: OpenAPIV3.PathsObject = {};

  routes.forEach(route => {
    if (!paths[route.url]) {
      paths[route.url] = {};
    }

    const pathItem = paths[route.url] as OpenAPIV3.PathItemObject
    const operation: OpenAPIV3.OperationObject = {
      summary: `${route.method} ${route.url}`,
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: route.responseSchema
            }
          }
        }
      }
    };

    if (route.payloadSchema) {
      operation.requestBody = {
        content: {
          'application/json': {
            schema: route.payloadSchema
          }
        }
      };
    }
    
    switch (route.method) {
      case 'GET':
        pathItem.get = operation
        break;
      case 'POST':
        pathItem.post = operation
        break;
      case 'DELETE':
        pathItem.delete = operation
        break;
    }
  });

  return {
    openapi: '3.0.0',
    info: {
      title: 'VisionDirector API',
      version: '1.0.0',
      description: 'API for managing multiple video sources in Norsk Studio'
    },
    paths
  };
}

const openApiSpec = generateOpenApiSpec(routes);
console.log(JSON.stringify(openApiSpec, null, 2));

export default function(R: Registration) {
  const {
    defineComponent,
    Av,
    common: { Resolutions, FrameRates }
  } = R;
  const InlineView = React.lazy(async () => import('./inline-view'));
  const SummaryView = React.lazy(async () => import('./summary-view'));
  const FullscreenView = React.lazy(async () => import('./fullscreen-view'));

  return defineComponent<MultiCameraSelectConfig, MultiCameraSelectState, MultiCameraSelectCommand, MultiCameraSelectEvent>({
    identifier: 'processor.multiCameraSelect',
    category: 'processor',
    name: "MultiCamera",
    subscription: {
      accepts: {
        type: 'multi-stream',
        media: Av
      },
      produces: {
        type: "single-stream",
        media: Av
      }
    },
    extraValidation: (ctx) => {
      // Each input *has* to come with video AND audio
      // and they can't come from different sources
      // We might want a 'join' node for that purpose ( :-( )
      ctx.subscriptions.forEach((s) => {
        if (s.streams.select.includes("audio") && s.streams.select.includes("video")) {
          return;
        }
        ctx.addError("Each subscription for MultiCamera must contain both video *and* audio, subscription to " + s.source + " only contains " + s.streams.select.join(","));
      })
    },
    display: (desc) => {
      return {
        resolution: desc.config.resolution.width.toString() + "x" + desc.config.resolution.height.toString(),
        frameRate: desc.config.frameRate.frames.toString() + "/" + desc.config.frameRate.seconds.toString(),
      }
    },
    css: [
      "style.css",
      "tailwind.css"
    ],
    runtime: {
      initialState: () => ({
        activeSource: { id: '' },
        availableSources: [],
        knownSources: [],
        players: []
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case 'active-source-changed':
            return { ...state, activeSource: ev.activeSource };
          case 'source-online':
            state.availableSources.push(ev.source);
            return { ...state };
          case 'player-online':
            state.players.push({ source: ev.source, player: ev.url });
            return { ...state };
          case 'preview-player-online':
            state.previewPlayerUrl = ev.url;
            return { ...state };
          case 'source-offline': {
            const sourceIndex = state.availableSources.findIndex((s) => s.key == ev.source.key && s.id == ev.source.id);
            const playerIndex = state.players.findIndex((s) => s.source.key == ev.source.key && s.source.id == ev.source.id);
            if (sourceIndex >= 0)
              state.availableSources.splice(sourceIndex, 1);
            if (playerIndex >= 0)
              state.players.splice(playerIndex, 1);
            return { ...state };
          }
          case "sources-discovered": {
            state.knownSources = ev.sources;
            return { ...state }
          }
          default:
            assertUnreachable(evType);
        }
      },
      inline: InlineView,
      summary: SummaryView,
      fullscreen: FullscreenView
    },
    configForm: {
      global: {
        iceServers: GlobalIceServers(R),
        hardware: HardwareSelection()
      },
      form: {
        resolution: {
          help: "All video will be normalised to this resolution", hint: { type: 'select', options: Resolutions, defaultValue: { width: 1920, height: 1080 } }
        },
        frameRate: {
          help: "All video will be normalised to this frame rate", hint: { type: 'select', options: FrameRates, defaultValue: { frames: 25, seconds: 1 } }
        },
        sampleRate: {
          help: "All audio will be normalised to this sample rate",
          hint: {
            defaultValue: 48000,
            type: 'select', options: [
              { value: 48000, display: "48000" },
              { value: 44100, display: "44100" }
            ]
          }
        },
        channelLayout: {
          help: "All audio will be normalised to this channel layout",
          hint: {
            defaultValue: "stereo",
            type: 'select', options: [
              { value: "mono", display: "Mono" },
              { value: "stereo", display: "Stereo" }
            ]
          }
        },
      },
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
