import { autoRegisterComponents } from "norsk-studio/lib/extension/registration"
import path from 'path';

export const registerAll = autoRegisterComponents(__dirname,
  path.join(__dirname, "../client/info.js"),
  (p: string) => p.replace('lib', 'client'));

export default registerAll;
