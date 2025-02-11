import { Norsk } from "@norskvideo/norsk-sdk";
import { OnCreated, StudioRuntime } from "@norskvideo/norsk-studio/lib/extension/runtime-types";
import AutoCmafDefinition, { AutoCmaf, AutoCmafConfig, CmafOutputCommand, CmafOutputEvent, CmafOutputState } from "../output.autoCmaf/runtime";

export default class AutoHlsDefinition extends AutoCmafDefinition {
  override async create(norsk: Norsk, cfg: AutoCmafConfig, cb: OnCreated<AutoCmaf>, runtime: StudioRuntime<CmafOutputState, CmafOutputCommand, CmafOutputEvent>): Promise<void> {
    return this.createImpl(norsk, { mode: "ts", ...cfg }, cb, runtime)
  }

}
