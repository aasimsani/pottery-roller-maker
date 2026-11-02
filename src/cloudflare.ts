// Cloudflare serves the app at aasimsani.net/projects/pottery-stencil-maker/, but the build keeps its
// files at the root of dist/ so that it still runs from any static host. This Worker strips the prefix
// before it looks up the file.
const PREFIX = '/projects/pottery-stencil-maker';

type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // The build uses relative asset paths, which only resolve under the prefix when the URL ends in a slash.
    if (url.pathname === PREFIX) return Response.redirect(`${url.origin}${PREFIX}/`, 301);
    if (url.pathname.startsWith(`${PREFIX}/`)) url.pathname = url.pathname.slice(PREFIX.length);
    return env.ASSETS.fetch(new Request(url, request));
  },
};
