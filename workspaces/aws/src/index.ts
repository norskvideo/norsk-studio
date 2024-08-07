import { autoRegisterComponents } from "@norskvideo/norsk-studio/lib/extension/registration"
import { RuntimeSystem } from "@norskvideo/norsk-studio/lib/extension/runtime-system";
import path from 'path';

export async function registerAll(r: RuntimeSystem) {
  r.registerGlobalStylesheet(path.join(__dirname, "../client/style.css"));
  return autoRegisterComponents(__dirname,
    path.join(__dirname, "../client/info.js"),
    (p: string) => p.replace('lib', 'client'))(r);
}

export default registerAll;
