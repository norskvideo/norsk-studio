import fs from 'fs/promises';
import YAML from 'yaml';
import { resolveRefs } from 'json-refs';
import { OpenAPIV3 } from 'openapi-types';

export async function schemaFromTypes(path: string, keys: { config?: string, state?: string }) {
  const types = await fs.readFile(path)
  const root = YAML.parse(types.toString());
  const resolved = await resolveRefs(root, {}).then((r) => r.resolved as OpenAPIV3.Document);
  return {
    config: keys.config ? resolved.components!.schemas![keys.config] as OpenAPIV3.SchemaObject : undefined,
    state: keys.state ? resolved.components!.schemas![keys.state] as OpenAPIV3.SchemaObject : undefined
  }
}
