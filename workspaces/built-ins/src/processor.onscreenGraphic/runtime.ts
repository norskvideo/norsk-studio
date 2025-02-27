import { ComposePart, FileImageInputNode, Norsk, SourceMediaNode, VideoComposeDefaults, VideoComposeNode, VideoStreamMetadata, videoToPin } from '@norskvideo/norsk-sdk';
import { CreatedMediaNode, InstanceRouteArgs, InstanceRouteInfo, OnCreated, RelatedMediaNodes, RuntimeUpdates, ServerComponentDefinition, StaticRouteInfo, StudioNodeSubscriptionSource, StudioRuntime } from '@norskvideo/norsk-studio/lib/extension/runtime-types';
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
import { defineApi } from '@norskvideo/norsk-studio/lib/server/api';

export type OnscreenGraphicPosition = CoordinatePosition | PercentagePosition | NamedPosition;
export type CoordinatePosition = components['schemas']['coordinatePosition'];
export type PercentagePosition = components['schemas']['percentagePosition'];
export type NamedPosition = components['schemas']['namedPosition'];
export type OnscreenGraphicFile = components['schemas']['graphic'];
export type OnscreenGraphicApiConfig = components['schemas']['config'];

export type OnscreenGraphicConfig = {
  __global: {
    hardware?: HardwareAccelerationType,
    dataDir?: string
  },
  id: string,
  displayName: string,
  notes?: string,
  initialGraphic?: OnscreenGraphicFile,
  initialPosition?: OnscreenGraphicPosition;
}

export type OnscreenGraphicState = {
  activeGraphic?: {
    file?: OnscreenGraphicFile,
    position?: OnscreenGraphicPosition
  },
  currentVideo?: { width: number, height: number },
  currentGraphic?: { width: number, height: number },
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
} | {
  type: 'video-changed',
  currentVideo?: { width: number, height: number },
} | {
  type: 'graphic-loaded',
  currentGraphic?: { width: number, height: number },
}

function graphicsDir() {
  return path.join(Config.server.workingDir(), process.env.ONSCREENGRAPHIC_DIRECTORY ?? "graphics");
}

// From the `image` crate
const extensions = [
  "jpg", "jpeg", "jfif",
  "png", "apng",
  "gif",
  "webp",
  "tif", "tiff",
  "tga",
  "dds",
  "bmp",
  "ico",
  "hdr",
  "exr",
  "pbm", "pam", "ppm", "pgm",
  "ff",
  "qoi",
  "pcx",
];

async function getGraphics() {
  const files = await fs.readdir(graphicsDir());
  const images = files.filter((f) => {
    return extensions.some(extension => f.endsWith("." + extension));
  })
  return images;
}

function clamp(min: number, num: number, max: number): number {
  return num < min ? min : num > max ? max : num;
}

function resolveNamedPosition(
  position: OnscreenGraphicPosition,
  videoWidth: number,
  videoHeight: number,
  imageWidth: number,
  imageHeight: number
): { x: number, y: number } {
  const maxX = videoWidth - imageWidth;
  const maxY = videoHeight - imageHeight;
  if (position.type === 'coordinate') {
    return { x: clamp(0, position.x, maxX), y: clamp(0, position.y, maxY) };
  } else if (position.type === 'percentage') {
    return { x: maxX * clamp(0, position.x, 100) / 100, y: maxY * clamp(0, position.y, 100) / 100 };
  } else if (position.type === 'named') {
    switch (position.position) {
      case 'topleft':
        return { x: 0, y: 0 };
      case 'topright':
        return { x: maxX, y: 0 };
      case 'bottomleft':
        return { x: 0, y: maxY };
      case 'bottomright':
        return { x: maxX, y: maxY };
      case 'center':
        return { x: maxX / 2, y: maxY / 2 };
      default:
        assertUnreachable(position.position);
    }
  } else {
    assertUnreachable(position);
  }
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
      filename: function(_req, file, cb) {
        cb(null, path.basename(file.originalname));
      }
    });

    const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      void checkFileExists(file, cb);
    };

    const checkFileExists = async (file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      try {
        const existingGraphics = await getGraphics();
        if (existingGraphics.includes(file.originalname)) {
          cb(new Error('A graphic with this name already exists'));
        } else {
          cb(null, true);
        }
      } catch (error) {
        cb(error as Error);
      }
    };

    const upload = multer({ storage, fileFilter });


    return defineApi<paths, void>(path.join(__dirname, 'types.yaml'), {
      '/graphics': {
        get: (_) => (async (_req: Request, res: Response) => {
          const images = await getGraphics();
          res.json(images);
        }),
        post: () => async (req, res) => {
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
        }
      },
      "/graphic": {
        delete: () => async (req, res) => {
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
        }
      }
    })
  }

  async instanceRoutes(): Promise<InstanceRouteInfo<OnscreenGraphicConfig, OnscreenGraphic, OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>[]> {
    return defineApi<paths, InstanceRouteArgs<OnscreenGraphicConfig, OnscreenGraphic, OnscreenGraphicState, OnscreenGraphicCommand, OnscreenGraphicEvent>>(
      path.join(__dirname, 'types.yaml'),
      {
        '/active-graphic': {
          get: ({ runtime }) => (_req: Request, res: Response) => {
            const latest = runtime.updates.latest();
            if (latest.activeGraphic?.file && latest.activeGraphic?.position) {
              res.json({
                graphic: latest.activeGraphic.file,
                position: latest.activeGraphic.position
              });
            }
            else {
              res.status(204).send();
            }
          },
          post: ({ runtime }) => async (req, res) => {
            if ((req.body.graphic || req.body.position)) {
              if (req.body.position) {
                const position = req.body.position;

                // Validate position based on type
                if (position.type === 'coordinate') {
                  if (typeof position.x !== 'number' || typeof position.y !== 'number' ||
                    position.x < 0 || position.y < 0) {
                    res.status(400).json({
                      error: "Bad position",
                      details: "Coordinate position must have non-negative x and y values"
                    });
                    return;
                  }
                } else if (position.type === 'named') {
                  if (!['topleft', 'topright', 'bottomleft', 'bottomright', 'center'].includes(position.position)) {
                    res.status(400).json({
                      error: "Bad position",
                      details: "Named position must be one of: topleft, topright, bottomleft, bottomright, center"
                    });
                    return;
                  }
                } else {
                  res.status(400).json({
                    error: "Bad position",
                    details: "Position must specify either type 'coordinate' or 'named'"
                  });
                  return;
                }
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
          },
          delete: ({ runtime }) => async (_req, res) => {
            runtime.updates.sendCommand({
              type: 'change-graphic'
            })
            res.status(204).send();
          }
        }
      });
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
  activeImage: number = 0;
  composeId: number = 0;
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
      await this.composeNode?.close();
      this.composeNode = undefined;
      this.currentVideo = undefined;
      this.doSubs();
      this.updates.raiseEvent({ type: 'video-changed', currentVideo: undefined });
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
      this.updates.raiseEvent({ type: 'video-changed', currentVideo: this.currentVideo });

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

          id: `${this.id}-compose-${this.composeId++}`,
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

      if (this.imageSource || this.oldImageSource) {
        const newImageStream = this.imageSource?.outputStreams[0];
        const oldImageStream = this.oldImageSource?.outputStreams[0];
        if (newImageStream && oldImageStream) {
          this.doSubs();

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
          if (newImageStream) {
            this.updates.raiseEvent({ type: 'graphic-loaded', currentGraphic: imageStream.message.value });
          }
          this.composeNode?.updateConfig({
            parts: [
              this.videoPart(),
              this.imagePart(this.position ?? { type: 'coordinate', x: 0, y: 0 })
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
      debuglog("Changing graphic", { id: this.id, graphic, position, fileName: path.join(graphicsDir(), graphic) });
      this.graphic = graphic;
      this.activeImage = this.activeImage + 1;
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
      if (this.composeNode) {
        this.composeNode.updateConfig({
          parts: [
            this.videoPart(),
            this.imagePart(position ?? { type: 'coordinate', x: 0, y: 0 })
          ]
        });
      }
      await this.contexts.schedule();
    }
    this.updates.raiseEvent({ type: 'graphic-changed', file: graphic, position })
  }

  imagePart(position: OnscreenGraphicPosition): ComposePart<"graphic"> {
    const foo: ComposePart<"graphic"> = {
      id: "graphic",
      zIndex: 1,
      compose: (metadata, cfg) => {
        const videoWidth = cfg.outputResolution.width;
        const videoHeight = cfg.outputResolution.height;
        const imageWidth = Math.min(videoWidth - 100, metadata.width);
        const imageHeight = Math.min(videoHeight - 100, metadata.height);

        const resolvedPos = resolveNamedPosition(
          position,
          videoWidth,
          videoHeight,
          imageWidth,
          imageHeight
        );
        return {
          sourceRect: { x: 0, y: 0, width: metadata.width, height: metadata.height },
          destRect: {
            x: resolvedPos.x,
            y: resolvedPos.y,
            width: imageWidth,
            height: imageHeight
          }
        };
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
