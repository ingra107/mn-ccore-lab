import { nowInstant } from './time';
describe('nowInstant (Worker)', () => {
  it('returns Z-marked ISO string', () => {
    expect(nowInstant()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/);
  });
});
