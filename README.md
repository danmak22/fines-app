# Fines

A simple, mobile-first web app for running group "fines" sessions.

- **Anyone** can submit a fine and see the public leaderboard (names + counts only).
- **The Fine Master** unlocks a PIN-protected view to see every fine, read them out one at a time, mark them done, merge misspelled names, and close the session.

Fine details are private. That is enforced in the database with Row Level Security: the public key can only insert fines, and everything else goes through `SECURITY DEFINER` functions. The Fine Master functions check the PIN against a bcrypt hash before they do anything.

## Files

- `index.html` is the whole app (HTML/CSS/vanilla JS + supabase-js from a CDN).
- `schema.sql` holds the tables, RLS policies and functions.
- `sw.js`, `manifest.webmanifest`, `icons/` make the app installable and usable offline.
- `vendor/supabase.js` is supabase-js 2.45.4, served from the repo instead of a CDN.
- `worker/app.js` + `wrangler.jsonc` host the whole app on Cloudflare.
- `worker/supabase-proxy.js` is the `fines-proxy` Worker the GitHub Pages copy uses to reach Supabase.

## Setup

1. **Create a Supabase project.** Sign up at [supabase.com](https://supabase.com), click **New project**, choose a name and a database password, and wait for it to finish provisioning.

2. **Run the SQL.** In your project, open **SQL Editor** → **New query**. Paste in the whole of `schema.sql` and click **Run**.

3. **Set the Fine Master PIN.** In a new SQL query, run the following with your own PIN:

   ```sql
   insert into public.settings (id, pin_hash)
   values (1, extensions.crypt('your-pin-here', extensions.gen_salt('bf')))
   on conflict (id) do update set pin_hash = excluded.pin_hash;
   ```

   Run the same statement again later to change the PIN. Anyone with the page can make PIN guesses, so use at least 6 characters (a short word or phrase is fine too).

4. **Add your project URL and key to the HTML.** In Supabase, go to **Project Settings → API** (or **Connect**) and copy the **Project URL** and the **anon / publishable** key. Paste them near the top of the `<script>` in `index.html`:

   ```js
   const SUPABASE_URL = 'https://xxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';   // or sb_publishable_...
   ```

   This key is meant to be public. The database rules are what keep the fines private. **Never** put the `service_role` / secret key in the page.

5. **Host it.** With GitHub Pages: push the repo to GitHub, then go to **Settings → Pages**, set **Source** to *Deploy from a branch* and **Branch** to `main` / `(root)`, and save. After a minute the app is live at `https://<user>.github.io/<repo>/`. Share that link with the group.

6. **Host it on Cloudflare too (recommended).** Some networks (e.g. in Zimbabwe) block GitHub Pages. On Cloudflare, the page and the data come from one address, which works in more places:
   1. In the Cloudflare dashboard, go to **Workers & Pages → Create application → Connect GitHub**, and pick this repo.
   2. Keep the project name **`gym-fines`** (it must match `wrangler.jsonc`), leave the build command empty, keep the deploy command `npx wrangler deploy`, and click **Deploy**.
   3. The app goes live at `https://gym-fines.<your-subdomain>.workers.dev`. Every push to `main` redeploys it automatically.

   `worker/app.js` serves the page and forwards `/rest/v1/...` to Supabase. Files listed in `.assetsignore` (SQL, Worker code, README) aren't published.

## Offline mode

The app can be installed (browser menu → **Add to Home screen**) and works with weak or no signal:

- It opens from a copy saved on the phone if the network doesn't answer within 3 seconds.
- The leaderboard shows the last saved copy, marked "Offline · last updated …".
- A fine submitted with no signal is saved on the phone and sent automatically once the phone is back online. The home screen shows how many are waiting. Its time is recorded when it reaches the server.
- The Fine Master view always needs a connection, so private fines are never stored on a phone.

`sw.js` (the service worker) keeps the saved copy. If you add a new file the app needs offline, add it to `SHELL` in `sw.js` and bump `CACHE`.

## Using it

- **Home:** tap **Submit a Fine**, or check the leaderboard to see who still needs a fine.
- **Submit:** enter your name, who you're fining, what they did and the penalty. Names you've typed before are suggested as you type.
- **Fine Master:** tap **🔒 Fine Master** at the bottom of the home screen and enter the PIN.
  - **Read out** shows one fine at a time in big text, with Prev / Done / Next buttons.
  - **Mark done** greys out a fine once it has been read or paid.
  - **Merge names** fixes typos, e.g. merge "Jon" into "John".
  - **Close session** archives every current fine (into `archived_fines`) and resets the leaderboard.

Names are stored trimmed and in lower case, so "john", "John " and "JOHN" count as one person. They're shown in Title Case.
