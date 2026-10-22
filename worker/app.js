// Cloudflare Worker for the whole app: the page and its files are
// served as static assets (see wrangler.jsonc), and /rest/v1/...
// is forwarded to Supabase from the same address, so phones only
// need to reach this one Cloudflare site.
// It also pings Supabase on a schedule (see "triggers" in wrangler.jsonc)
// so the free-tier project isn't paused for inactivity.
// No secrets here: the anon key below is the same public key as in index.html.

const SUPABASE_URL = 'https://axjmiczdhpwzjocrmkdy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HdX5meaO2HuWt4bnMgLcYg_dQy3c4m7';

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

  // Keep-alive: read-only call to get_leaderboard(). Throwing marks the run
  // as failed in the Cloudflare dashboard, so a broken ping is visible.
  async scheduled() {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_leaderboard', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    console.log(`Supabase keep-alive: HTTP ${res.status}`);
    if (!res.ok) throw new Error(`Supabase keep-alive failed: HTTP ${res.status} ${await res.text()}`);
  },
};
