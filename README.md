# Fines

A simple, mobile-first web app for running group "fines" sessions.

- **Anyone** can submit a fine and see the public leaderboard (names + counts only).
- **The Fine Master** unlocks a PIN-protected view to see every fine, read them out one at a time, mark them done, merge misspelled names, and close the session.

Fine details are private. That is enforced in the database with Row Level Security: the public key can only insert fines, and everything else goes through `SECURITY DEFINER` functions. The Fine Master functions check the PIN against a bcrypt hash before they do anything.

## Files

- `index.html` is the whole app (HTML/CSS/vanilla JS + supabase-js from a CDN).
- `schema.sql` holds the tables, RLS policies and functions.

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

   You can also host it on Netlify or Cloudflare Pages, or anywhere else that serves a static file.

## Using it

- **Home:** tap **Submit a Fine**, or check the leaderboard to see who still needs a fine.
- **Submit:** enter your name, who you're fining, what they did and the penalty. Names you've typed before are suggested as you type.
- **Fine Master:** tap **🔒 Fine Master** at the bottom of the home screen and enter the PIN.
  - **Read out** shows one fine at a time in big text, with Prev / Done / Next buttons.
  - **Mark done** greys out a fine once it has been read or paid.
  - **Merge names** fixes typos, e.g. merge "Jon" into "John".
  - **Close session** archives every current fine (into `archived_fines`) and resets the leaderboard.

Names are stored trimmed and in lower case, so "john", "John " and "JOHN" count as one person. They're shown in Title Case.
