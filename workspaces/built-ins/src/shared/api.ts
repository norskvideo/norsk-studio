import { OpenAPIV3 } from 'openapi-types';

export type Transmuted<T> = {
  [Key in keyof T]: OpenAPIV3.PathItemObject;
};

export function coreInfo<T>(path: keyof T, op: OpenAPIV3.OperationObject) {
  return {
    url: path,
    summary: op.summary,
    description: op.description,
    requestBody: op.requestBody,
    responses: op.responses,
  }
}

export function get<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['get']!),
    method: 'GET' as const,
  }
}

export function post<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['post']!),
    method: 'POST' as const,
  }
}

export function delete_<T>(path: keyof T, paths: Transmuted<T>) {
  return {
    ...coreInfo(path, paths[path]['delete']!),
    method: 'DELETE' as const,
  }
}
