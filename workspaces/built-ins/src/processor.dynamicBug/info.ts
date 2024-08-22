import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { DynamicBugCommand, DynamicBugConfig, DynamicBugEvent, DynamicBugState } from "./runtime";
import { HardwareSelection } from "@norskvideo/norsk-studio/lib/shared/config";
import { NextFunction, Request, Response } from 'express';
import { OpenAPIV3 } from 'openapi-types';
import React from "react";

type RouteInfo = {
  url: string,
  method: 'GET' | 'POST' | 'DELETE',
  handler: (req: Request, res: Response, next: NextFunction) => void,
  payloadSchema: OpenAPIV3.SchemaObject,
  responseSchema: OpenAPIV3.SchemaObject,
}

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
      title: 'DynamicBug API',
      version: '1.0.0',
      description: 'API for managing the overlay of static images in Norsk Studio'
    },
    paths
  };
}

// RouteInfo objects based on DynamicBugDefinition
export const routes: RouteInfo[] = [
  {
    url: '/active-bug',
    method: 'GET',
    handler: (_req: Request, res: Response) => {
      res.send(JSON.stringify({
        bug: 'string',
        position: 'string'
      }));
    },
    payloadSchema: {},
    responseSchema: {
      type: 'object',
      properties: {
        bug: { type: 'string', description: 'name the image file' },
        position: { type: 'string' },
      },
    },
  },
  {
    url: '/active-bug',
    method: 'DELETE',
    handler: (_req: Request, res: Response) => {
      res.send("ok");
    },
    payloadSchema: {},
    responseSchema: {
      type: 'string',
    },
  },
  {
    url: '/active-bug',
    method: 'POST',
    handler: (req: Request, res: Response) => {
      res.send("ok");
    },
    payloadSchema: {
      type: 'object',
      properties: {
        bug: { type: 'string', description: 'filepath of the bug to overlay' },
        position: { 
          type: 'string',
          enum: ['topleft', 'topright', 'bottomleft', 'bottomright']
        },
      },
    },
    responseSchema: {
      type: 'string',
    },
  },
  {
    url: '/bugs',
    method: 'POST',
    handler: (_req: Request, res: Response) => {
      res.send('File uploaded successfully');
    },
    payloadSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
    responseSchema: {
      type: 'string',
    },
  },
  {
    url: '/bugs',
    method: 'GET',
    handler: (_req: Request, res: Response) => {
      res.send(JSON.stringify(['string']));
    },
    payloadSchema: {},
    responseSchema: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
];

const openApiSpec = generateOpenApiSpec(routes);
console.log(JSON.stringify(openApiSpec, null, 2))


export default function({
  defineComponent,
  Video
}: Registration) {
  const BugSelection = React.lazy(async () => import('./bug-selection'));
  const SummaryView = React.lazy(async () => import('./summary-view'));

  return defineComponent<DynamicBugConfig, DynamicBugState, DynamicBugCommand, DynamicBugEvent>({
    identifier: 'processor.dynamicBug',
    category: 'processor',
    name: "Dynamic Bug",
    description: "",
    subscription: {
      // Only accept a single video stream
      accepts: {
        type: 'single-stream',
        media: Video
      },
      produces: {
        type: "single-stream",
        media: Video
      }
    },
    extraValidation: function(ctx) {
      ctx.requireVideo(1);
    },
    display: (desc) => {
      return {
        default: desc.config.initialBug ?? 'none',
      }
    },
    runtime: {
      summary: SummaryView,
      initialState: () => ({
      }),
      handleEvent: (ev, state) => {
        const evType = ev.type;
        switch (evType) {
          case "bug-changed":
            return { ...state, activeBug: { file: ev.file, position: ev.position } };
          default:
            assertUnreachable(evType)

        }
      }
    },
    configForm: {
      global: {
        hardware: HardwareSelection()
      },
      form: {
        initialBug: {
          help: "The initial bug to render on the video (if any)",
          hint: {
            type: "custom",
            optional: true,
            component: BugSelection,
          }
        },
        initialPosition: {
          help: "The initial location at which to render the bug",
          hint: {
            type: 'select',
            optional: true,
            options: [
              { value: 'topleft', display: 'Top Left' },
              { value: 'topright', display: 'Top Right' },
              { value: 'bottomleft', display: 'Bottom Left' },
              { value: 'bottomright', display: 'Bottom Right' }
            ]
          }
        }
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}

