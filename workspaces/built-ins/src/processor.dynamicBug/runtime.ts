import { ComposePart, FileImageInputNode, Norsk, SourceMediaNode, VideoComposeNode, VideoStreamMetadata, videoToPin } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import Config from "@norskvideo/norsk-studio/lib/server/config";
import { RouteInfo } from "@norskvideo/norsk-studio/lib/extension/client-types";
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';
import { OpenAPIV3 } from 'openapi-types';
import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import bodyParser from 'body-parser';
import express from 'express'
import multer, { Multer } from 'multer';
import { addDynamicRoute, addStaticRoute } from '@norskvideo/norsk-studio/lib/extension/runtime-system';


const dynamicBugPositions = ["topleft", "topright", "bottomleft", "bottomright"] as const;
export type DynamicBugPosition = typeof dynamicBugPositions[number];

export type DynamicBugConfig = {
  __global: {
    hardware?: HardwareAccelerationType,
    dataDir?: string
  },
  id: string,
  displayName: string,
  initialBug?: string
  initialPosition?: DynamicBugPosition;
}

export type DynamicBugState = {
  activeBug?: {
    file?: string,
    position?: DynamicBugPosition
  },
}

export type DynamicBugCommand = {
  type: 'change-bug',
  file?: string,
  position?: DynamicBugPosition
}

export type DynamicBugEvent = {
  type: 'bug-changed',
  file?: string,
  position?: DynamicBugPosition
}

type DynamicRouteContext = {
  node: DynamicBug,
  upload: Multer
}

type StaticRouteContext = {
  upload: Multer
}

export function generateOpenApiSpec(routes: RouteInfo<DynamicRouteContext>[]): OpenAPIV3.Document {
  const paths: OpenAPIV3.PathsObject = {};

  const allRoutes = routes.concat( staticRoutes);
  allRoutes.forEach(route => {
    if (!paths[route.url]) {
      paths[route.url] = {};
    }

    const pathItem = paths[route.url] as OpenAPIV3.PathItemObject
    const operation: OpenAPIV3.OperationObject = {
      summary: `${route.method} ${route.url}`,
      responses: route.responses,
    };

    if (route.requestBody) {
      operation.requestBody = route.requestBody
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

    servers: [
      {
        url: "http://127.0.0.1:8000/live/api/{componentId}",
        variables: {
          componentId: {
            default: "dynamicBug", // TODO should probably be empty - or a list of componentIds
            description: "The ID of the component whose HTTP API you are using"
          },
        }
      }
    ],
    paths
  };
}

const bugProperty: OpenAPIV3.SchemaObject = {
  type: 'string',
  description: 'The name of the image file',
  example: 'Norsk.png',
};
const positionProperty: OpenAPIV3.SchemaObject = {
  type: 'string',
  description: 'Where to display the bug',
  example: 'topright',
  enum: dynamicBugPositions.slice() // The OpenApi type is mutable, so copy the array
};

const bugAndPositionSchema: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    bug: bugProperty,
    position: positionProperty,
  },
};

// RouteInfo objects based on DynamicBugDefinition
export const routes: RouteInfo<DynamicRouteContext>[] = [
  {
    url: '/active-bug',
    method: 'GET',
    handler: ({ node }) => ((_req: Request, res: Response) => {
      res.json({
        bug: node.bug,
        position: node.position
      });
    }),
    responses: {
      '200': {
        description: "Information about the currently overlaid bug (if any)",
        content: {
          "application/json": {
            schema: bugAndPositionSchema
          },
        }
      }
    }
  },
  {
    url: '/active-bug',
    method: 'POST',
    handler: ({ node }) => (async (req, res) => {
      if ((req.body.bug || req.body.position)) { // Allow empty requests to act as a delete
        if (!dynamicBugPositions.includes(req.body.position)) {
          res.status(400).json({
            error: "bad position",
            details: req.body.position
          });
          return;
        }
        const images = await getBugs();
        if (!images.includes(req.body.bug)) {
          res.status(400).json({
            error: "Unknown bug file",
            details: req.body.bug,
          });
          return;
        }
      }
      await node.setupBug(req.body.bug, req.body.position);
      res.status(204).send();
    }),
    requestBody: {
      description: "The bug filename and location (sending an empty JSON object will delete the bug)",
      content: {
        'application/json': {
          schema: bugAndPositionSchema,
          example: {
            bug: "Norsk.png",
            position: "topleft",
          }
        }
      },
    },
    responses: {
      '204': { description: "The active bug was successfully updated" },
      '400': {
        description: "Unknown bug",
        content: {
          "application/json": {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string', description: "A description of the error" },
                details: { type: 'string', description: "The unacceptable data" }
              }
            },
          }
        }
      }
    }
  },
  {
    url: '/active-bug',
    method: 'DELETE',
    handler: ({ node }) => (async (_req, res) => {
      await node.setupBug(undefined, undefined);
      res.status(204).send();
    }),
    responses: { '204': { description: "The active bug was successfully deleted" } }
  },

];

const staticRoutes: RouteInfo<StaticRouteContext>[] = [
  {
    url: '/bugs',
    method: 'POST',
    handler: ({ upload }) => [upload.single('file'), (async (req, res) => res.status(204).send())],
    requestBody: {
      description: "A multipart form containing the file to upload)",
      content: {
        'multipart/form-data': {
          schema: {
            type: "object",
            properties: {
              // The property name 'file' will be used for all files.
              'file': {
                type: "string",
                format: "binary",
              }
            },
            required: ['file'],
          }
        }
      }
    },
    responses: { '204': { description: "The file bug was uploaded successfully" } }
  },
  {
    url: '/bugs',
    method: 'GET',
    handler: (_) => (async (_req: Request, res: Response) => {
      const images = await getBugs();
      res.json(images);
    }),
    responses: {},
  },
];

const openApiSpec = generateOpenApiSpec(routes);
console.log(JSON.stringify(openApiSpec, null, 2))



// Use the top level working dir and shove a bugs folder inside it
function bugDir() {
  return path.join(Config.server.workingDir(), process.env.DYNAMICBUG_DIRECTORY ?? "bugs");
}

async function getBugs() {
  const files = await fs.readdir(bugDir());
  const images = files.filter((f) => {
    return f.endsWith(".png") || f.endsWith(".jpg");
  })
  return images;
}


export default class DynamicBugDefinition implements ServerComponentDefinition<DynamicBugConfig, DynamicBug, DynamicBugState, DynamicBugCommand, DynamicBugEvent> {
  async create(norsk: Norsk, cfg: DynamicBugConfig, cb: OnCreated<DynamicBug>, runtime: StudioRuntime<DynamicBugState, DynamicBugEvent>) {
    const node = await DynamicBug.create(norsk, cfg, runtime.updates);
    cb(node);

    const storage = multer.diskStorage({
      destination: bugDir(),
      filename: function (_req, file, cb) {
        cb(null, path.basename(file.originalname));
      }
    });
    const upload = multer({ storage });
    const context = { node, upload };

    routes.forEach(route => addDynamicRoute(runtime, context, route));
    // Make the static routes also available under the URL of the runtime component
    staticRoutes.forEach(route => addDynamicRoute(runtime, context, route));
  }

  routes(): Router {
    const router = express.Router()
    router.use(bodyParser.json());
    const storage = multer.diskStorage({
      destination: bugDir(),
      filename: function (_req, file, cb) {
        cb(null, path.basename(file.originalname));
      }
    });
    const upload = multer({ storage });
    staticRoutes.forEach((route) => addStaticRoute(router, {upload}, route));
    return router;
  }

  async handleCommand(node: DynamicBug, command: DynamicBugCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'change-bug':
        await node.setupBug(command.file, command.position);
        break;
      default:
        assertUnreachable(commandType);

    }
  }
}

export class DynamicBug implements CreatedMediaNode {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  contexts: ContextPromiseControl = new ContextPromiseControl(this.handleContext.bind(this));
  norsk: Norsk;
  cfg: DynamicBugConfig;
  bug?: string;
  position?: DynamicBugPosition;

  videoSource?: StudioNodeSubscriptionSource;
  composeNode?: VideoComposeNode<"video" | "bug">;
  imageSource?: FileImageInputNode;
  oldImageSource?: FileImageInputNode;
  activeImage: "a" | "b" = "a";
  initialised: Promise<void>;
  updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>;
  currentVideo?: VideoStreamMetadata;

  static async create(norsk: Norsk, cfg: DynamicBugConfig, updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>) {
    const node = new DynamicBug(norsk, cfg, updates);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: DynamicBugConfig, updates: RuntimeUpdates<DynamicBugState, DynamicBugEvent>) {
    this.cfg = cfg;
    this.id = cfg.id;
    this.norsk = norsk;
    this.updates = updates;
    this.initialised = this.initialise();
  }


  async handleContext() {
    const video = this.videoSource?.latestStreams()[0]?.metadata;
    if (!video || !this.videoSource || video.message.case !== 'video') {
      // may as well just shut everything down
      // cos we can't do anything without the video
      await this.composeNode?.close();
      this.composeNode = undefined;
      this.currentVideo = undefined;
      return;
    } else {
      const nextVideo = video.message.value;
      debuglog("Creating compose for dynamic bug", { id: this.id, metadata: nextVideo });
      if (this.currentVideo) {
        if (nextVideo.height !== this.currentVideo.height || nextVideo.width !== this.currentVideo.width) {
          debuglog("Closing compose node in dynamic bug because of metadata change", { id: this.id, old: this.currentVideo, new: nextVideo });
          await this.composeNode?.close();
          this.currentVideo = undefined;
        }
      }
      this.currentVideo = nextVideo;

      // If we haven't got a compose node, then spin one up
      // with the resolution/etc of the incoming stream
      if (!this.composeNode) {
        const thisCompose = this.composeNode = await this.norsk.processor.transform.videoCompose<'video' | 'bug'>({
          onCreate: (n) => {
            this.relatedMediaNodes.addOutput(n);
            this.relatedMediaNodes.addInput(n);
          },
          onClose: () => {
            this.relatedMediaNodes.removeOutput(thisCompose);
            this.relatedMediaNodes.removeOutput(thisCompose);
          },
          id: `${this.id}-compose`,
          referenceStream: 'video',
          // Could accept quadra, but there is pending work on quadra compose
          // which means that non-fullscreen overlays have a few outstanding issues
          hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["nvidia"]),
          outputResolution: {
            width: nextVideo.width,
            height: nextVideo.height
          },
          parts: [
            this.videoPart(nextVideo.width, nextVideo.height),
          ]
        });
        this.doSubs();
      }

      // What we want to do here is
      // If there is *only* an imageSource, then go ahead and use it, parts and all
      // If there are both old and new sources, then use the old source and subscribe to it if the new source hasn't got a stream yet
      // If there are are streams from both sources
      // remove the subscription entirely
      // close the old node and swap them
      // then re-do this whole thing

      // Re-configure the compose node based on what we have, or don't have
      // prefering the new image source if it exists
      if (this.imageSource || this.oldImageSource) {
        const newImageStream = this.imageSource?.outputStreams[0];
        const oldImageStream = this.oldImageSource?.outputStreams[0];
        if (newImageStream && oldImageStream) {
          // Clear the subs
          this.doSubs();

          // Reset the compose node to have no overlay
          this.composeNode?.updateConfig({
            parts: [
              this.videoPart(nextVideo.width, nextVideo.height),
            ]
          })
          debuglog("Closing old image source for bug", { id: this.id, oldNode: this.oldImageSource?.id, newNode: this.imageSource?.id })
          void this.oldImageSource?.close();
          this.oldImageSource = undefined;
          await this.handleContext();
          return;
        }

        if (newImageStream) {
          this.doSubs(this.imageSource);
        } else if (oldImageStream) {
          this.doSubs(this.oldImageSource);
        }
        const imageStream = newImageStream ?? oldImageStream;
        if (imageStream && imageStream.message.case == 'video') {
          this.composeNode?.updateConfig({
            parts: [
              this.videoPart(nextVideo.width, nextVideo.height),
              this.imagePart(this.position ?? 'topleft',
                nextVideo.width,
                nextVideo.height,
                imageStream.message.value.width,
                imageStream.message.value.height)
            ]
          })
        } else {
          this.doSubs();
          this.composeNode?.updateConfig({
            parts: [
              this.videoPart(nextVideo.width, nextVideo.height),
            ]
          })
        }
      }
    }
  }

  doSubs(imageSource?: FileImageInputNode) {
    if (!imageSource) {
      debuglog("Doing subscriptions for dynamic bug without image source");
      this.composeNode?.subscribeToPins(this.videoSource?.selectVideoToPin("video") || [])
    } else {
      debuglog("Doing subscriptions for dynamic bug with image source", { id: this.id, image: imageSource.id });
      this.composeNode?.subscribeToPins((this.videoSource?.selectVideoToPin<"video" | "bug">("video") ?? []).concat([
        { source: imageSource, sourceSelector: videoToPin("bug") }
      ]))
    }
  }

  async setupBug(bug?: string, position?: DynamicBugPosition) {
    this.position = position;
    if (!bug || bug === "") {
      debuglog("Clearing bug", { id: this.id })
      this.doSubs();
      await this.imageSource?.close();
      this.imageSource = undefined;
      this.bug = undefined;
      this.position = undefined;
      this.updates.raiseEvent({ type: 'bug-changed' })
      await this.contexts.schedule();
      return;
    } else if (bug !== this.bug) {
      debuglog("Changing bug", { id: this.id, bug, position })
      this.bug = bug;
      this.activeImage = this.activeImage == "a" ? "b" : "a";
      this.oldImageSource = this.imageSource;
      this.imageSource = await this.norsk.input.fileImage({
        id: `${this.id}-${this.activeImage}`,
        sourceName: `${this.id}-bug-${this.activeImage}`,
        fileName: path.join(bugDir(), bug)
      })
      this.setSources();
    } else {
      debuglog("Changing bug position", { id: this.id, bug, position })
      this.position = position;
      await this.contexts.schedule();
    }
    this.updates.raiseEvent({ type: 'bug-changed', file: bug, position })
  }

  imagePart(position: DynamicBugPosition,
    videoWidth: number,
    videoHeight: number,
    imageWidth: number,
    imageHeight: number): ComposePart<"bug"> {

    // We shouldn't need this, pending work on Compose
    imageWidth = Math.min(videoWidth - 100, imageWidth);
    imageHeight = Math.min(videoHeight - 100, imageHeight);

    const foo = {
      id: "bug",
      zIndex: 1,
      sourceRect: { x: 0, y: 0, width: videoWidth, height: videoHeight },
      referenceResolution: undefined,

      // What to do about resolution?
      // we could subscribe to the output of the image source and do some maths
      // to preserve aspect ratio before building this config?
      destRect: (position == 'topleft' ? { x: 5, y: 5, width: imageWidth, height: imageHeight } :
        position == 'topright' ? { x: videoWidth - imageWidth - 5, y: 5, width: imageWidth, height: imageHeight } :
          position == 'bottomleft' ? { x: 5, y: videoHeight - imageHeight - 5, width: imageWidth, height: imageHeight } :
            { x: videoWidth - imageWidth - 5, y: videoHeight - imageHeight - 5, width: imageWidth, height: imageHeight }),
      opacity: 1.0,
      pin: "bug"
    } as const;
    return foo;
  }

  videoPart(videoWidth: number, videoHeight: number): ComposePart<"video"> {
    return {
      id: "video",
      zIndex: 0,
      sourceRect: { x: 0, y: 0, width: videoWidth, height: videoHeight },
      destRect: { x: 0, y: 0, width: videoWidth, height: videoHeight },
      opacity: 1.0,
      pin: "video"
    }
  }

  async initialise() {
    await this.setupBug(this.cfg.initialBug, this.cfg.initialPosition);
  }

  subscribe(sources: StudioNodeSubscriptionSource[]) {
    this.videoSource = sources[0];
    this.setSources();
  }

  setSources() {
    const imageSources: SourceMediaNode[] = [];
    if (this.oldImageSource) imageSources.push(this.oldImageSource);
    if (this.imageSource) imageSources.push(this.imageSource);
    this.contexts.setSources(this.videoSource ? [this.videoSource] : [], imageSources)
  }
}

