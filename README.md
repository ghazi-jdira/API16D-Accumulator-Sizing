# API 16D Accumulator Sizing Calculator — Frontend

An interactive calculator for sizing surface BOP-stack accumulators following
**API 16D Annex C** (Methods B & C), using **NIST nitrogen properties** for
precharge-density optimization.

This repository is the **frontend only**. It is a thin client: it collects the
inputs, sends them to a backend API, and renders the returned results. **No
confidential data or formulas live here** — the NIST nitrogen grid, the Cameron
EB702D shear constants, the BOP specs and every calculation stay on the server.

> ⚠️ **Two-repository architecture.** GitHub Pages serves *everything* in a repo,
> so the confidential data must **not** be in this repo. The backend lives in a
> **separate, private** repository (the `API16D-Backend` folder) deployed to
> Render. Never copy the backend's `data/` files into this Pages repo.

```
┌──────────────────────┐        HTTPS + Google ID token        ┌─────────────────────────┐
│  GitHub Pages (this)  │  ──────────────────────────────────▶ │  Render (private backend) │
│  index.html / js / css│   POST /api/compute  {inputs}         │  FastAPI + NIST + formulas │
│  (no secret data)     │  ◀──────────────────────────────────  │  email allowlist           │
└──────────────────────┘            {results}                   └─────────────────────────┘
```

## Features

- **Method B (drawdown)** and **Method C (well-control sequence)** sizing side by side
- **NIST nitrogen property engine** (density / entropy, bilinear interpolation) — server-side
- **Shear pressure calculator** (Cameron EB702D, ppf and OD/ID methods) — server-side
- **Optimum precharge** branch logic (ρ-intersect vs. volume-governed)
- **Volume-vs-precharge chart** on a `<canvas>` (no charting library)
- Bottle counts for 11-gal and 15-gal bottles
- Editable Method B / Method C equipment tables
- **Username/password sign-in**, verified on the server

## Configure

Edit **`js/config.js`** with your backend URL (not a secret — the API URL is public):

```js
window.APP_CONFIG = {
  apiBase: "https://api16d-backend.onrender.com", // your Render URL
};
```

Logins (usernames & passwords) are managed on the backend — see the backend README.

## Deploy to GitHub Pages

1. Push this folder to a (public or private) GitHub repo:

   ```bash
   git init
   git add .
   git commit -m "API 16D accumulator sizing — frontend"
   git branch -M main
   git remote add origin https://github.com/<you>/<frontend-repo>.git
   git push -u origin main 
   ```

2. **Settings → Pages → Source → GitHub Actions** (the included
   `.github/workflows/deploy.yml` publishes on every push to `main`), or
   **Deploy from a branch → `main` / root** since the site is static.

3. The calculator is live at `https://<you>.github.io/<frontend-repo>/`.
   Add that exact origin to the backend's `ALLOWED_ORIGINS` (see backend README).

## Backend

The backend is **not** in this repo. See `API16D-Backend/README.md` for the
FastAPI service, the Render deployment, the `SECRET_KEY` / `ALLOWED_ORIGINS`
configuration, and how to manage logins (`manage_users.py`). Editing BOP
equipment now happens in the backend's `data/bopSpecs.json`.

## Security model

- The login form posts the username/password to the backend (`POST /api/login`).
- The server verifies them against stored **PBKDF2 password hashes** and returns
  a short-lived **HMAC-signed token**.
- Every API call sends that token as `Authorization: Bearer <token>`; the server
  re-verifies it before running any calculation or returning any data.
- Passwords are **never stored in the browser**, and the confidential data and
  formulas are **never sent** to an unauthenticated caller and are **not present**
  in this static repo — so there is nothing to scrape from the page source. This
  is real, server-enforced access control (unlike a client-side password gate).

## Accuracy

Validated against the reference workbook (API 16D Annex C, Example 6). With the
default inputs the tool reproduces the workbook's minimum volume (~213.02 gal),
optimum precharge (1624 psig), governing branch (ρ-intersect), and shear
pressures (1958 / 2331 psi).

## Disclaimer

For engineering estimation only. Verify results against the API 16D standard
before making design decisions.

## License

[MIT](LICENSE)
