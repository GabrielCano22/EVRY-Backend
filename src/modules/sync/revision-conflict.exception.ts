import { ConflictException } from '@nestjs/common';

export class RevisionConflictException extends ConflictException {
  constructor(
    serverVersion: unknown,
    code = 'REVISION_CONFLICT',
    message = 'La versión del servidor cambió. Revisa el conflicto antes de continuar.',
  ) {
    super({ code, message, retryable: false, serverVersion });
  }
}
