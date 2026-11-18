This is the Revelio ICPC Custom Scoreboard Revelator.

Frontend UI scaffold:
- React + TypeScript + Vite
- Modular scoreboard components
- Mock contest gateway ready to swap for a Python backend later

The current Vite version requires Node.js 18.x or 20+ and npm.
After cloning, install the exact dependencies recorded in `package-lock.json`
and start the development server:

```bash
npm ci
npm run dev
```

Create a production build with `npm run build`. Preview it locally with
`npm run preview`.

Run participant filtering regression tests with `npm test`.

When creating or editing a Codeforces contest, use **Scoreboard Participants**
beside **Codeforces Access** to include `CONTESTANT`, `OUT_OF_COMPETITION`, and/or
`VIRTUAL`. Save Settings applies the selection to both the live scoreboard and
the revelator, including rankings, recent submissions, and the reveal queue.
Contestant and Virtual are selected by default. Clearing all three produces an
empty scoreboard. Practice and Manager participants are always excluded.

Commit `package.json` and `package-lock.json` when changing dependencies.
Installed dependencies (`node_modules/`), production output (`dist/`), caches,
and local environment files are ignored and recreated locally.

No environment file is required. Codeforces contest URLs use the Codeforces API;
other contest URLs use mock data.
To configure an HTTP backend, set `VITE_REVELIO_API_BASE_URL` in `.env.local`.
Vite exposes `VITE_` variables to the browser, so do not put secrets in them.
