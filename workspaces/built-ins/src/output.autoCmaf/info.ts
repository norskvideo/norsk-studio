import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import { GlobalEzDrmConfig, GlobalAxinomConfig } from "@norskvideo/norsk-studio/lib/shared/config";
import type { AutoCmafConfig, AutoCmafDestination, CmafOutputCommand, CmafOutputEvent, CmafOutputState } from "./runtime";
import React from "react";
import { discriminatedForm } from "@norskvideo/norsk-studio/lib/extension/client-types";

// Accepts as many video and audio streams as you might want
// It's of note that we probably don't want to accidentally subscribe to
// the same video stream twice (stream switch + encode output for example)
// so maybe we need to mark things as producers/passthrough and follow that path back
// We can as a starter not allow video from the same original source in twice?
// and we can validate that at the top level

export default function(R: Registration) {
  const {
    defineComponent,
    All,
    validation: { Z, Hostname },
  } = R;
  const SummaryView = React.lazy(async () => import('./summary-view'));
  const FullscreenView = React.lazy(async () => import('./fullscreen'));
  const InlineView = React.lazy(async () => import('./inline-view'));

  const SegmentConfiguration = React.lazy(async () => {
    const views = await import('./form-views')
    return { default: views.SegmentConfiguration }
  });
  const Destination = React.lazy(async () => {
    const views = await import('./form-views')
    return { default: views.Destination }
  });

  return defineComponent<AutoCmafConfig, CmafOutputState, CmafOutputCommand, CmafOutputEvent>({
    identifier: 'output.autoCmaf',
    category: 'output',
    name: "Auto CMAF",
    description: "This component handles the creation of CMAF outputs from multiple video and audio streams.",
    subscription: {
      // Again, accept anything
      // but reject the same stream twice
      // this is probably important given the amount of places we split audio/video
      accepts: {
        type: "multi-stream",
        media: All
      }
    },
    extraValidation: (ctx) => {
      const audioStreams = ctx.subscriptions.filter((s) => s.validatedStreams.select.includes("audio"));
      if (audioStreams.length == 0) {
        ctx.addError("AutoPlaylist requires at least one audio stream")
      }
      // hard to validate on multiple audio streams, as you can have one per 'stream'
      // I think we need to raise sensible runtime errors somewhere

      // This can be even more clever (check the types of the nodes and only warn if they are different for example)
      // but this will get us through IBC
      const uniqueVideoStreamNodes = ctx.subscriptions.reduce((acc, s) => {
        if (s.validatedStreams.select.includes("video")) {
          if (!acc.includes(s.source)) {
            acc.push(s.source);
          }
        }
        return acc;
      }, [] as string[]);

      if (uniqueVideoStreamNodes.length > 1) {
        ctx.addWarning("More than one video source detected, did you mean to do this? (For example: Did you subscribe to both a source *and* a ladder?)");
      }


      // `ctx.config.__global` is currently not set client-side
      if (ctx.config.drmProvider && ctx.config.__global) {
        if (ctx.config.drmProvider === 'ezdrm') {
          if (!ctx.config.__global.ezdrmConfig?.token) {
            ctx.addError("Provide EZDRM token in global configuration");
          }
        }
        if (ctx.config.drmProvider === 'axinom') {
          if (!ctx.config.__global.axinomConfig?.tenantId) {
            ctx.addError("Provide Axinom DRM Tenant ID in global configuration");
          }
          if (!ctx.config.__global.axinomConfig?.managementKey) {
            ctx.addError("Provide Axinom DRM Management Key in global configuration");
          }
        }
      }
    },
    display: (desc) => {
      return {
        name: desc.config.name
      };
    },
    runtime: {
      initialState: () => ({
        enabled: true,
      }),
      handleEvent(ev, state) {
        const evType = ev.type;
        switch (evType) {
          case 'url-published':
            state.url = ev.url;
            state.drmToken = ev.drmToken;
            break;
          case 'output-enabled':
            state.enabled = true;
            break;
          case 'output-disabled':
            state.enabled = false;
            break;
          default:
            assertUnreachable(evType)
        }
        return { ...state };
      },
      summary: SummaryView,
      fullscreen: FullscreenView,
      inline: InlineView
    },
    configForm: {
      global: {
        ezdrmConfig: GlobalEzDrmConfig(R),
        axinomConfig: GlobalAxinomConfig(R),
      },
      form: {
        name: {
          help: "The name of the multivariant/dash playlist",
          hint: {
            type: 'text', defaultValue: "default", validation: Z.string().min(5).max(15)
          }
        },
        sessionId: {
          help: "Generate a unique session id per run to avoid cache collisions",
          hint: {
            type: 'boolean',
            defaultValue: false
          }
        },
        segments: {
          help: "Detailed segment configuration",
          hint: {
            type: 'form-item',
            view: SegmentConfiguration,
            envOverride: true,
            form: {
              retentionPeriod: {
                help: "How many seconds of data to retain for playback in media playlists",
                hint: {
                  type: "numeric",
                  defaultValue: 60,
                  validation: Z.number().min(10).max(3600)
                }
              },
              defaultSegmentCount: {
                help: "How many segments to display in a default playlist (0 means show all)",
                hint: {
                  type: "numeric",
                  defaultValue: 0,
                  validation: Z.number()
                }
              },
              targetSegmentDuration: {
                help: "How many seconds should be in each segment",
                hint: {
                  type: "numeric",
                  defaultValue: 4.0,
                  validation: Z.number().min(1).max(10)
                }
              },
              targetPartDuration: {
                help: "For low latency playlists, what size parts should be generated in seconds",
                hint: {
                  type: "numeric",
                  defaultValue: 1.0,
                  validation: Z.number().min(0.2).max(10),
                  global: {
                    constraint: 'custom',
                    message: "Part duration must be less than segment duration",
                    validate: (cfg) => {
                      if (cfg.targetPartDuration < cfg.targetSegmentDuration)
                        return true;
                      return false;
                    }
                  }
                },
              },
              holdBackSegments: {
                help: "How many segments back should a player start",
                hint: {
                  type: "numeric",
                  optional: true,
                  validation: Z.number().min(3).max(10).int().optional(),
                },
              },
              holdBackParts: {
                help: "How many parts back should a player start",
                hint: {
                  type: "numeric",
                  optional: true,
                  validation: Z.number().min(3).max(10).int().optional(),
                },
              },
            }
          }
        },
        destinations: {
          help: "Destinations to publish to",
          hint: {
            type: "form-list-pick",
            envOverride: true,
            defaultValue: [],
            view: Destination,
            form: discriminatedForm<AutoCmafDestination["type"], AutoCmafDestination>({
              akamai: {
                display: "Akamai",
                form: {
                  ingest: {
                    help: "The complete URL to be pushed to",
                    hint: {
                      type: "text",
                      // validation: ali
                    }
                  },
                  playback: {
                    help: "The URL from which playback can be accessed",
                    hint: {
                      type: "text",
                      defaultValue: ""
                    }
                  },
                  includeAdInsertions: {
                    help: "If ad markers are inserted, include them in this publication",
                    hint: {
                      type: "boolean",
                      defaultValue: false
                    }
                  }
                }
              },
              s3: {
                display: "S3",
                form: {
                  host: {
                    help: "The hostname of the s3 bucket to push to",
                    hint: {
                      type: "text",
                      validation: Hostname
                    }
                  },
                  prefix: {
                    help: "The sub directory of the bucket to place playlists and segments into",
                    hint: {
                      type: "text",
                      defaultValue: ""
                    }
                  },
                  includeAdInsertions: {
                    help: "If ad markers are inserted, include them in this publication",
                    hint: {
                      type: "boolean",
                      defaultValue: false
                    }
                  }
                }
              }
            })
          }
        },
        initialState: {
          help: "The publishing state of this endpoint by default on start-up",
          hint: {
            type: 'select',
            defaultValue: 'enabled',
            options: [
              {
                display: "Enabled",
                value: 'enabled',
              },
              {
                display: "Disabled",
                value: 'disabled',
              },
            ],
          },
        },
        multiplePrograms: {
          help: "Produce multiple multivariants if more than one program is present",
          hint: {
            type: 'boolean',
            optional: true,
            defaultValue: false
          },
        },
        drmProvider: {
          help: "Encrypt with a DRM provider (if configured globally)",
          hint: {
            type: 'select',
            optional: true,
            options: [
              {
                display: "EZDRM",
                value: 'ezdrm',
              },
              {
                display: "Axinom DRM",
                value: 'axinom',
              },
            ],
          },
        },
        notes: {
          help: "Additional notes about this component",
          hint: {
            type: 'text',
            optional: true
          }
        },
      }
    }
  });
}

function assertUnreachable(_: never): never {
  throw new Error("Didn't expect to get here");
}
