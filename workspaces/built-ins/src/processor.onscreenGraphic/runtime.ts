import { ComposePart, FileImageInputNode, Norsk, SourceMediaNode, VideoComposeDefaults, VideoComposeNode, VideoStreamMetadata, videoToPin } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, InstanceRouteInfo, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StaticRouteInfo, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
import { debuglog, warninglog } from '@norskvideo/norsk-studio/lib/server/logging';
import { HardwareAccelerationType, contractHardwareAcceleration } from '@norskvideo/norsk-studio/lib/shared/config';
import { assertUnreachable } from '@norskvideo/norsk-studio/lib/shared/util';
import Config from "@norskvideo/norsk-studio/lib/server/config";
import { ContextPromiseControl } from '@norskvideo/norsk-studio/lib/runtime/util';
import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { components, paths } from './types';

import { resolveRefs } from 'json-refs';
import YAML from 'yaml';
import { OpenAPIV3 } from 'openapi-types';

export type OnscreenGraphicPosition = components['schemas']['position'];
export type OnscreenGraphicFile = components['schemas']['graphic'];
export type OnscreenGraphicApiConfig = components['schemas']['config'];
const onscreenGraphicPositions: OnscreenGraphicPosition[] = ['topleft', 'topright', 'bottomleft', 'bottomright'];

export type OnscreenGraphicConfig = {
  __global: {
    hardware?: HardwareAccelerationType,
    dataDir?: string
  },
  id: string,
  displayName: string,
  initialGraphic?: OnscreenGraphicFile,
  initialPosition?: OnscreenGraphicPosition;
}

export type OnscreenGraphicState = {
  activeGraphic?: {
    file?: OnscreenGraphicFile,
    position?: OnscreenGraphicPosition
  },
}

export type OnscreenGraphicCommand = {
  type: 'change-graphic',
  file?: OnscreenGraphicFile,
  position?: OnscreenGraphicPosition
}

export type OnscreenGraphicEvent = {
  type: 'graphic-changed',
  file?: OnscreenGraphicFile,
  position?: OnscreenGraphicPosition
}

// Use the top level working dir and put a graphics folder inside it
function graphicsDir() {
  return path.join(Config.server.workingDir(), process.env.ONSCREENGRAPHIC_DIRECTORY ?? "graphics");
}

async function getGraphics() {
  const files = await fs.readdir(graphicsDir());
  const images = files.filter((f) => {
    return f.endsWith(".png") || f.endsWith(".jpg");
  })
  return images;
}

export default class OnscreenGraphicDefinition implements ServerComponentDefinition<OnscreenGraphicConfig, OnscreenGraphic, OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent> {
  async create(norsk: Norsk, cfg: OnscreenGraphicConfig, cb: OnCreated<OnscreenGraphic>, runtime: StudioRuntime<OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>) {
    const node = await OnscreenGraphic.create(norsk, cfg, runtime.updates);
    cb(node);
  }

  async handleCommand(node: OnscreenGraphic, command: OnscreenGraphicCommand) {
    const commandType = command.type;
    switch (commandType) {
      case 'change-graphic':
        await node.setupGraphic(command.file, command.position);
        break;
      default:
        assertUnreachable(commandType);

    }
  }

  async staticRoutes(): Promise<StaticRouteInfo[]> {
    const storage = multer.diskStorage({
      destination: graphicsDir(),
      filename: function (_req, file, cb) {
        cb(null, path.basename(file.originalname));
      }
    });

    const fileFilter = async function (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
      try {
        const existingGraphics = await getGraphics();
        if (existingGraphics.includes(file.originalname)) {
          return cb(new Error('A graphic with this name already exists'));
        } else {
          cb(null, true);
        }
      } catch (error) {
        cb(error as Error);
      }
    }
    const upload = multer({ storage, fileFilter });
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);

    type Transmuted<T> = {
      [Key in keyof T]: OpenAPIV3.PathItemObject;
    };
    const paths = resolved.paths as Transmuted<paths>;

    const get = (path: keyof paths) => {
      return {
        ...coreInfo(path, paths[path]['get']!),
        method: 'GET' as const,
      }
    };
    const post = (path: keyof paths) => {
      return {
        ...coreInfo(path, paths[path]['post']!),
        method: 'POST' as const,
      }
    };
    const delete_ = (path: keyof paths) => {
      return {
        ...coreInfo(path, paths[path]['delete']!),
        method: 'DELETE' as const,
      }
    };

    const coreInfo = (path: string, op: OpenAPIV3.OperationObject) => {
      return {
        url: path,
        summary: op.summary,
        description: op.description,
        requestBody: op.requestBody,
        responses: op.responses,
      }
    }
    return [
      {
        ...get('/graphics'),
        handler: (_) => (async (_req: Request, res: Response) => {
          const images = await getGraphics();
          res.json(images);
        })
      },
      {
        ...post('/graphics'),
        handler: () => async (req, res) => {
          const uploader = upload.single('file');
          uploader(req, res, (err) => {
            if (err) {
              if (err.message === 'A graphic with this name already exists') {
                return res.status(409).json({ error: err.message });
              }
              warninglog("An error occured during upload", err);
              return res.status(500).json({ error: 'File upload failed' });
            }
            res.status(204).send();
          });
        },
      },
      {
        ...delete_('/graphic'),
        handler: () => (async (req, res) => {
          const filename = req.body.filename;
          const filePath = path.join(graphicsDir(), filename);
          try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            res.status(204).send();
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              res.status(404).json({ error: 'Graphic not found' });
            } else {
              warninglog("Error deleting graphic", error);
              res.status(500).json({ error: 'Failed to delete graphic' });
            }
          }
        }),
      }
    ]

  }


  async instanceRoutes(): Promise<InstanceRouteInfo<OnscreenGraphicConfig, OnscreenGraphic, OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>[]> {
    const types = await fs.readFile(path.join(__dirname, 'types.yaml'))
    const root = YAML.parse(types.toString());
    const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
    return [
      {
        url: '/active-graphic',
        summary: 'Info about the current graphic',
        method: 'GET',
        handler: ({ runtime }) => ((_req: Request, res: Response) => {
          const latest = runtime.updates.latest();
          const response: OnscreenGraphicApiConfig = {
            graphic: latest.activeGraphic?.file,
            position: latest.activeGraphic?.position
          };
          res.json(response);
        }),
        responses: {
          '200': {
            description: "Information about the currently overlaid graphic (if any)",
            content: {
              "application/json": {
                schema: resolved.components!.schemas!['config']
              },
            }
          }
        }
      },
      {
        url: '/active-graphic',
        summary: 'Change the current graphic file or position',
        method: 'POST',
        handler: ({ runtime }) => (async (req, res) => {
          if ((req.body.graphic || req.body.position)) { // Allow empty requests to act as a delete
            if (!onscreenGraphicPositions.includes(req.body.position)) {
              res.status(400).json({
                error: "bad position",
                details: req.body.position
              });
              return;
            }
            const images = await getGraphics();
            if (!images.includes(req.body.graphic)) {
              res.status(400).json({
                error: "Unknown graphic",
                details: req.body.graphic,
              });
              return;
            }
          }
          runtime.updates.sendCommand({
            type: 'change-graphic',
            file: req.body.graphic,
            position: req.body.position
          })
          res.status(204).send();
        }),
        requestBody: {
          description: "The graphic filename and location (sending an empty JSON object will delete the graphic)",
          content: {
            'application/json': {
              schema: resolved.components!.schemas!['config']
            }
          },
        },
        responses: {
          '204': { description: "The active graphic was successfully updated" },
          '400': {
            description: "Unknown graphic",
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
        url: '/active-graphic',
        summary: 'Stop displaying the current graphic',
        method: 'DELETE',
        handler: ({ runtime }) => (async (_req, res) => {
          runtime.updates.sendCommand({
            type: 'change-graphic'
          })
          res.status(204).send();
        }),
        responses: { '204': { description: "The active graphic was successfully deleted" } }
      },
    ]
  }
}

export class OnscreenGraphic implements CreatedMediaNode {
  id: string;
  relatedMediaNodes: RelatedMediaNodes = new RelatedMediaNodes();

  contexts: ContextPromiseControl = new ContextPromiseControl(this.handleContext.bind(this));
  norsk: Norsk;
  cfg: OnscreenGraphicConfig;
  graphic?: string;
  position?: OnscreenGraphicPosition;

  videoSource?: StudioNodeSubscriptionSource;
  composeNode?: VideoComposeNode<"video" | "graphic">;
  imageSource?: FileImageInputNode;
  oldImageSource?: FileImageInputNode;
  activeImage: "a" | "b" = "a";
  initialised: Promise<void>;
  updates: RuntimeUpdates<OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>;
  currentVideo?: VideoStreamMetadata;

  static async create(norsk: Norsk, cfg: OnscreenGraphicConfig, updates: RuntimeUpdates<OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>) {
    const node = new OnscreenGraphic(norsk, cfg, updates);
    await node.initialised;
    return node;
  }

  constructor(norsk: Norsk, cfg: OnscreenGraphicConfig, updates: RuntimeUpdates<OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>) {
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
      this.doSubs();
      return;
    } else {
      const nextVideo = video.message.value;
      debuglog("Creating compose for onscreen graphic", { id: this.id, metadata: nextVideo });
      if (this.currentVideo) {
        if (nextVideo.height !== this.currentVideo.height || nextVideo.width !== this.currentVideo.width) {
          debuglog("Closing compose node in onscreen graphic because of metadata change", { id: this.id, old: this.currentVideo, new: nextVideo });
          await this.composeNode?.close();
          this.currentVideo = undefined;
        }
      }
      this.currentVideo = nextVideo;

      // If we haven't got a compose node, then spin one up
      // with the resolution/etc of the incoming stream
      if (!this.composeNode) {
        debuglog("Creating compose node for onscreen graphic", { id: this.id, width: nextVideo.width, height: nextVideo.height });
        const thisCompose = this.composeNode = await this.norsk.processor.transform.videoCompose<'video' | 'graphic'>({
          onCreate: (n) => {
            this.relatedMediaNodes.addOutput(n);
            this.relatedMediaNodes.addInput(n);
          },
          onClose: () => {
            this.relatedMediaNodes.removeOutput(thisCompose);
          },
          id: `${this.id}-compose`,
          referenceStream: 'video',
          hardwareAcceleration: contractHardwareAcceleration(this.cfg.__global.hardware, ["nvidia", "quadra"]),
          missingStreamBehaviour: 'drop_part',
          outputResolution: {
            width: nextVideo.width,
            height: nextVideo.height
          },
          parts: [
            this.videoPart(),
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
              this.videoPart(),
            ]
          })
          debuglog("Closing old image source for graphic", { id: this.id, oldNode: this.oldImageSource?.id, newNode: this.imageSource?.id })
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
              this.videoPart(),
              this.imagePart(this.position ?? 'topleft')
            ]
          })
        } else {
          this.doSubs();
          this.composeNode?.updateConfig({
            parts: [
              this.videoPart(),
            ]
          })
        }
      }
    }
  }

  doSubs(imageSource?: FileImageInputNode) {
    if (!imageSource) {
      debuglog("Doing subscriptions for onscreen graphic without image source");
      this.composeNode?.subscribeToPins(this.videoSource?.selectVideoToPin("video") || [])
    } else {
      debuglog("Doing subscriptions for onscreen graphic with image source", { id: this.id, image: imageSource.id });
      this.composeNode?.subscribeToPins((this.videoSource?.selectVideoToPin<"video" | "graphic">("video") ?? []).concat([
        { source: imageSource, sourceSelector: videoToPin("graphic") }
      ]))
    }
  }

  async setupGraphic(graphic?: string, position?: OnscreenGraphicPosition) {
    this.position = position;
    if (!graphic || graphic === "") {
      debuglog("Clearing graphic", { id: this.id })
      this.doSubs();
      await this.imageSource?.close();
      this.imageSource = undefined;
      this.graphic = undefined;
      this.position = undefined;
      this.updates.raiseEvent({ type: 'graphic-changed' })
      await this.contexts.schedule();
      return;
    } else if (graphic !== this.graphic) {
      debuglog("Changing graphic", { id: this.id, graphic, position })
      this.graphic = graphic;
      this.activeImage = this.activeImage == "a" ? "b" : "a";
      this.oldImageSource = this.imageSource;
      this.imageSource = await this.norsk.input.fileImage({
        id: `${this.id}-${this.activeImage}`,
        sourceName: `${this.id}-graphic-${this.activeImage}`,
        fileName: path.join(graphicsDir(), graphic)
      })
      this.setSources();
    } else {
      debuglog("Changing graphic position", { id: this.id, graphic, position })
      this.position = position;
      await this.contexts.schedule();
    }
    this.updates.raiseEvent({ type: 'graphic-changed', file: graphic, position })
  }

  imagePart(position: OnscreenGraphicPosition): ComposePart<"graphic"> {
    // // We shouldn't need this, pending work on Compose
    // imageWidth = Math.min(videoWidth - 100, imageWidth);
    // imageHeight = Math.min(videoHeight - 100, imageHeight);

    const foo: ComposePart<"graphic"> = {
      id: "graphic",
      zIndex: 1,
      compose: (metadata, cfg) => {
        const videoWidth = cfg.outputResolution.width;
        const videoHeight = cfg.outputResolution.height;
        const imageWidth = Math.min(videoWidth - 100, metadata.width);
        const imageHeight = Math.min(videoHeight - 100, metadata.height);

        return {
          // Take the whole image
          sourceRect: { x: 0, y: 0, width: metadata.width, height: metadata.height },

          // And do a per pixel blit of the image 'as is', with an offset of 5 pixels
          destRect: (position == 'topleft' ? { x: 5, y: 5, width: imageWidth, height: imageHeight } :
            position == 'topright' ? { x: videoWidth - imageWidth - 5, y: 5, width: imageWidth, height: imageHeight } :
              position == 'bottomleft' ? { x: 5, y: videoHeight - imageHeight - 5, width: imageWidth, height: imageHeight } :
                { x: videoWidth - imageWidth - 5, y: videoHeight - imageHeight - 5, width: imageWidth, height: imageHeight })
        }
      },
      opacity: 1.0,
      pin: "graphic"
    } as const;
    return foo;
  }

  videoPart(): ComposePart<"video"> {
    return {
      id: "video",
      zIndex: 0,
      compose: VideoComposeDefaults.fullscreen(),
      opacity: 1.0,
      pin: "video"
    }
  }

  async initialise() {
    await this.setupGraphic(this.cfg.initialGraphic, this.cfg.initialPosition);
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
