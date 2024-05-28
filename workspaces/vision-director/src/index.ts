import { RegistrationConsts } from "norsk-studio/lib/extension/client-types";
import { RuntimeSystem } from "norsk-studio/lib/extension/runtime-system";
import * as path from 'path';
import { debuglog } from "norsk-studio/lib/server/logging";

import VisionDirector from './runtime';
import VisionDirectorInfo from './info';

export async function registerAll(system: RuntimeSystem) {
  debuglog("Registering vision director library from", __dirname);
  const component = new VisionDirector();
  system.registerComponent(component,
    VisionDirectorInfo(RegistrationConsts),
    path.join(__dirname, "../client/info.js")
  );
}

export default registerAll;

