// Cloudflare Worker: forwards every request
// to the Supabase project, for phones on
// networks that can't reach *.supabase.co.
// No secrets here: the public anon key
// still comes from index.html.

const SUPABASE_URL =
  'https://axjmiczdhpwzjocrmkdy.supabase.co';
const ALLOWED_ORIGIN =
  'https://danmak22.github.io';

// Headers about the hop to this Worker,
// which shouldn't be passed on.
const DROP = ['host', 'x-real-ip'];
const DROP_PREFIXES = ['cf-', 'x-forwarded-'];

function corsHeaders(request) {
  const asked = request.headers.get(
    'Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin':
      ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods':
      'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      asked || '*',
    'Access-Control-Expose-Headers':
      'Content-Range,Content-Profile',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request) {
    const cors = corsHeaders(request);

    // Answer the CORS preflight ourselves.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: cors,
      });
    }

    const url = new URL(request.url);
    const target =
      SUPABASE_URL + url.pathname + url.search;

    // Pass every other header through,
    // incl. apikey and Authorization.
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) {
      if (DROP.includes(name) ||
          DROP_PREFIXES.some(
            (p) => name.startsWith(p))) {
        headers.delete(name);
      }
    }

    const hasBody =
      !['GET', 'HEAD'].includes(request.method);
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody
        ? await request.arrayBuffer()
        : undefined,
      redirect: 'manual',
    });

    const response =
      new Response(upstream.body, upstream);
    for (const [name, value] of
         Object.entries(cors)) {
      response.headers.set(name, value);
    }
    return response;
  },
};
