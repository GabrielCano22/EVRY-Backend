import { Injectable, StreamableFile, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

@Injectable()
export class NullableJsonInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Nest's Express adapter sends an empty body for a root null. These endpoints
    // promise JSON null: stream the literal so both generated clients can parse it.
    return next.handle().pipe(map((value: unknown) => value === null
      ? new StreamableFile(Buffer.from('null'), { type: 'application/json' })
      : value));
  }
}
