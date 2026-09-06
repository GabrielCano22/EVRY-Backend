import { ValidationPipe } from '@nestjs/common';
import { ListExercisesDto } from './list-exercises.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const parse = (query: object) => pipe.transform(query, { type: 'query', metatype: ListExercisesDto });

it('accepts the q/page contract and transforms pagination numbers', async () => {
  await expect(parse({ q: 'Sentadilla', page: '2', limit: '30' })).resolves.toMatchObject({ q: 'Sentadilla', page: 2, limit: 30 });
});

it.each([
  { search: 'Sentadilla' }, { cursor: 'old-cursor' }, { page: '10001' },
  { limit: '31' }, { q: 'a'.repeat(81) }, { page: '0' },
])('rejects unsupported or unbounded catalog queries: %j', async (query) => {
  await expect(parse(query)).rejects.toMatchObject({ status: 400 });
});
