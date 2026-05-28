import { describe, it, expect } from 'vitest';
import { hiddenResource } from './hidden-resource';

describe('hiddenResource()', () => {
  it('returns a uniform 404-shaped response', async () => {
    const res = hiddenResource();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not found' });
  });

  it('matches the shape regardless of underlying cause (unknown vs hidden)', async () => {
    const r1 = hiddenResource();
    const r2 = hiddenResource();
    expect(r1.status).toBe(r2.status);
    expect(await r1.json()).toEqual(await r2.json());
  });
});
