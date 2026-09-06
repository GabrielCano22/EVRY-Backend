import type { OpenAPIObject, OperationObject, ResponseObject } from '@nestjs/swagger';

/** Fail generation rather than emitting successful responses typed as `never`. */
export function assertCompleteContract(document: OpenAPIObject): void {
  const ids = new Set<string>();
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'patch', 'put', 'delete', 'head', 'options'] as const) {
      const operation: OperationObject | undefined = item[method];
      if (!operation) continue;
      const label = `${method.toUpperCase()} ${path}`;
      if (!operation.operationId || ids.has(operation.operationId)) throw new Error(`Missing or duplicate operationId: ${label}`);
      ids.add(operation.operationId);
      const success = Object.entries(operation.responses).filter(([status]) => /^2\d\d$/.test(status));
      if (!success.length) throw new Error(`Missing success schema: ${label}`);
      for (const [status, response] of success) {
        if (!response || (status !== '204' && !('$ref' in response) && !(response as ResponseObject).content?.['application/json']?.schema)) {
          throw new Error(`Missing success schema: ${label} ${status}`);
        }
      }
    }
  }
}
