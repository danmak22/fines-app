// Cloudflare Worker for the whole app: the page and its files are
// served as static assets (see wrangler.jsonc), and /rest/v1/...
// is forwarded to Supabase from the same address, so phones only
// need to reach this one Cloudflare site.
// No secrets here: the public anon key still comes from index.html.

const SUPABASE_URL = 'https://axjmiczdhpwzjocrmkdy.supabase.co';

// Headers about the hop to this Worker, which shouldn't be passed on.
const DROP = ['host', 'x-real-ip'];
const DROP_PREFIXES = ['cf-', 'x-forwarded-'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/rest/v1/')) {
      return env.ASSETS.fetch(request);
    }

    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) {
      if (DROP.includes(name) || DROP_PREFIXES.some((p) => name.startsWith(p))) {
        headers.delete(name);
      }
    }

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    return fetch(SUPABASE_URL + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  },
};
