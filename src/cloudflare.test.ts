import { expect, test } from 'vitest';
import worker from './cloudflare';

// The fake ASSETS binding echoes the path it was asked for, so each test can see the rewrite.
const env = { ASSETS: { fetch: async (req: Request) => new Response(new URL(req.url).pathname) } };
const get = (path: string) => worker.fetch(new Request(`https://aasimsani.net${path}`), env);

test('a file under the projects prefix is served from the root of the build', async () => {
  const res = await get('/projects/pottery-stencil-maker/assets/index.js');
  expect(await res.text()).toBe('/assets/index.js');
});

test('the bare prefix redirects to its trailing-slash form, so relative asset paths resolve under it', async () => {
  const res = await get('/projects/pottery-stencil-maker');
  expect(res.status).toBe(301);
  expect(res.headers.get('location')).toBe('https://aasimsani.net/projects/pottery-stencil-maker/');
});

test('a path without the prefix passes through, so the workers.dev URL still serves the app at its root', async () => {
  const res = await get('/assets/index.js');
  expect(await res.text()).toBe('/assets/index.js');
});
