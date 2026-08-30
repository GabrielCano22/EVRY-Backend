import { canonicalApiUrl } from './api-version.middleware';

describe('canonicalApiUrl', () => {
  it.each([
    ['/api/auth/login', '/api/v1/auth/login'],
    ['/api/workouts?take=20', '/api/v1/workouts?take=20'],
    ['/api/v1/progress/overview', '/api/v1/progress/overview'],
    ['/media/exercises/1.jpg', '/media/exercises/1.jpg'],
  ])('normaliza %s como %s', (input, expected) => {
    expect(canonicalApiUrl(input)).toBe(expected);
  });
});
