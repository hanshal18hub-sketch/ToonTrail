# ToonTrail

ToonTrail is a discovery and reading-progress app for manga, manhwa, and manhua. It points readers to clearly labelled official or licensed sources; it does not host copyrighted chapters.

## Local development

```sh
npm ci
npm run dev
```

`npm run build` creates a self-contained Cloudflare Worker at `dist/server/index.js`.

## Cloudflare configuration

Create a Cloudflare Worker connected to this repository with:

- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler deploy`

Create a D1 database, apply `migrations/0001_panelpath_beta.sql`, and bind it to the Worker as `DB`. Add these Worker secrets/variables in Cloudflare—not in GitHub:

- `GOOGLE_CLIENT_ID` (variable)
- `GOOGLE_CLIENT_SECRET` (encrypted secret)
- `SESSION_SECRET` (encrypted secret; use at least 32 random bytes)
- `GOOGLE_REDIRECT_URI` (variable; `https://YOUR_DOMAIN/auth/google/callback`)

In Google Cloud Console, create a Web application OAuth client and add the exact same redirect URI. Never commit OAuth secrets, Cloudflare API tokens, or `.dev.vars`.

## Security model

- Google OAuth is performed server-side.
- Login state and sessions use signed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- Google access tokens are used only during login and are not stored.
- Reader data is stored in Cloudflare D1 and scoped by verified Google email.
- Production responses set CSP, clickjacking, MIME-sniffing, referrer, and permissions-policy headers.

See [SECURITY.md](SECURITY.md) for reporting guidance.
