import type Registration from "@norskvideo/norsk-studio/lib/extension/registration";
import type { StreamKeyOverrideConfig } from "./runtime";

export default function({
  defineComponent,
  All,
  validation: { Z },
}: Registration) {
  return defineComponent<StreamKeyOverrideConfig>({
    identifier: 'processor.StreamKeyOverride',
    category: 'processor',
    name: "Stream Key Override",
    description: "Override stream keys for several streams at once, setting some components of the keys and optionally incrementing stream ID.",
    subscription: {
      accepts: {
        type: 'multi-stream',
        media: All
      },
      produces: {
        type: "fixed-list",
        possibleMedia: All,
        keys: (_cfg, subs) => subs.flatMap(sub => {
          const sourceNode = sub.document.components[sub.source];
          const produces = sourceNode.info.subscription.produces;
          if (produces?.type === "fixed-list") {
            return produces
              .keys(sourceNode.config, sourceNode.subscriptions)
              // Prefix the keys and display names with a stable identifier
              .map(sel => ({ ...sel, key: `${sourceNode.id}-${sel.key}`, display: `${sourceNode.config.displayName}: ${sel.display}` }));
          } else {
            return [{ key: `${sourceNode.id}`, display: `${sourceNode.config.displayName}`, media: produces ? produces.media : All }];
          }
        }),
        selector: () => {
          console.error("Use selectOutputs from process.streamKeyOverride/runtime.ts, not selector from info.ts");
          return [];
        },
      }
    },
    display: ({ config }) => {
      const disp: Record<string, string> = {};
      disp.mode = config.mode || "simple";
      if (config.sourceName) {
        disp.sourceName = config.sourceName;
      }
      if (config.programNumber !== undefined) {
        disp.programNumber = String(config.programNumber);
      }
      if (config.streamId !== undefined) {
        disp.streamId = String(config.streamId);
      }
      if (config.renditionName) {
        disp.renditionName = config.renditionName;
      }
      return disp;
    },
    extraValidation: (ctx) => {
      const { config, subscriptions } = ctx;
      if ((config.mode || "simple") == "simple" && config.sourceName && config.programNumber !== undefined && config.streamId !== undefined && config.renditionName) {
        if (subscriptions.length > 1)
          ctx.addError("A fully specified stream key override must only subscribe to one stream");
      }
      if (config.mode === "by-media-type" && config.streamId === undefined) {
        ctx.addError("You must specify the starting streamId for a by-media-type stream key override");
      }
    },
    configForm: {
      form: {
        mode: {
          help: "Multi-stream behavior",
          hint: {
            type: 'select',
            defaultValue: "simple",
            options: [
              {
                display: "Override values directly",
                value: "simple",
              },
              {
                display: "Increment stream ID by media type (video, audio, ...)",
                value: "by-media-type",
              },
              {
                display: "Increment stream ID per program in order of subscription",
                value: "in-order",
              },
            ],
          },
        },
        sourceName: {
          help: "Override source name",
          hint: {
            type: 'text',
            optional: true,
          }
        },
        programNumber: {
          help: "Override program number",
          hint: {
            type: 'numeric',
            optional: true,
            validation: Z.number().min(0).int().optional(),
          }
        },
        streamId: {
          help: "Override stream ID",
          hint: {
            type: 'numeric',
            optional: true,
            validation: Z.number().min(0).int().optional(),
          }
        },
        renditionName: {
          help: "Override rendition name",
          hint: {
            type: 'text',
            optional: true,
          }
        },
      }
    }
  });
}
