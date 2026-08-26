# Glider Weight & Balance

A weight-and-balance calculator and flight log for the JS3, built from
`JS3 Weight and Balance Calculator v14 03072.xlsx`. Installs to an iPhone home
screen, works with no signal, and keeps every flight so you can see what
different loadings actually did for you.

**This is a convenience tool, not an approved document.** The signed weighing
report and the flight manual are authoritative. Re-check it against Jonker's
sheet after any weighing or equipment change.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The whole application: engine, UI, storage. No build step, no dependencies. |
| `js3-profile.json` | The aircraft parameters, as a separate file you can edit or replace. |
| `sw.js` | Service worker. Caches the app so it opens with no network. |
| `manifest.webmanifest` | Makes it installable as an app. |
| `icon-*.png` | Home screen icons, generated. |
| `icon.svg`, `icon-maskable.svg` | Icon sources. Edit these, then `node scripts/generate-icons.mjs`. |
| `schema.sql` | PostgreSQL schema for the flight database. |
| `server.js` | Optional sync endpoint, ~120 lines of Express. |

---

## Running it

### Try it now
Open `index.html` in a browser. Everything works except the service worker,
which needs a real origin.

### Put it online
Any static host serves this as-is — Netlify, Cloudflare Pages, GitHub Pages,
S3. Drop the folder in and you are done. Two rules:

- **HTTPS is required.** Service workers and home-screen install both refuse to
  run over plain HTTP (`localhost` is exempt).
- Keep every file in one directory so the service worker's scope covers the app.

Locally: `python3 -m http.server 8080`, then open `http://localhost:8080`.

### Install on iPhone
Open the URL in **Safari** (not Chrome — on iOS only Safari can install a web
app), tap Share → *Add to Home Screen*. It then launches full-screen with no
browser chrome, and works in aeroplane mode.

Note for iOS: if you do not open the app for a few weeks, Safari may evict its
storage. The flight log survives this only if you have sync switched on, or if
you have exported a CSV. That is the strongest argument for setting up the
server below.

---

## How offline works

The service worker caches the app shell on first load and serves it cache-first
afterwards, so the app opens instantly on the grid whether or not you have
signal. Flights are written to IndexedDB on the device **before** any network
call, and marked `dirty`. Nothing you do needs a connection.

The dot in the top right tells you where you stand: grey means offline, amber
means flights are waiting to sync, green means everything is up.

If IndexedDB is unavailable — private browsing, an old WebView — the app falls
back to memory rather than failing. You will not lose the calculator; you will
lose the log when you close the tab.

---

## The database

Local storage is always the source of truth for a flight until it syncs. The
server never invents rows; it accepts upserts and returns what is newer.

Set it up:

```bash
psql "$DATABASE_URL" -f schema.sql
npm install express pg
DATABASE_URL=postgres://... WB_TOKEN=$(openssl rand -hex 32) node server.js
```

Then in the app: Setup → Sync → paste `https://your-host/api/flights` and the
token. Sync runs on save, on regaining connectivity, and on demand.

Two routes are all the app uses:

```
GET  /api/flights?since=<iso8601>   -> { flights: [...] }
POST /api/flights                   <- { flights: [...] }
```

Conflicts resolve by `updatedAt`, last write wins. That is the right call for a
single pilot with a phone and a laptop; if you ever share a glider, move to
per-device row versions.

Supabase or Neon work without changing `schema.sql` — the commented-out
row-level-security policies at the bottom are what you want there, and you can
then drop `server.js` entirely and point the app at PostgREST.

---

## Re-parametrizing

Nothing about the JS3 is hard-coded in the engine. `js3-profile.json` holds it
all: arms, limits, envelope geometry, loading points, and the weighing that
produced the empty CG. Export it from Setup, edit, import it back — or ship a
different file with the app.

The parts worth understanding:

**Empty CG** comes from the weighing, not from a stored constant:

```
b = √(x² − d²)      a = c − b      CG = b·M2/(M1+M2) + a
```

Change `M1`, `M2` or `x` in Setup after a re-weigh and every number in the app
moves with it, including the pilot placard limits.

**The envelope** is generated from six numbers rather than a table of points,
which is why it re-draws correctly for any aircraft:

```json
"limits": {
  "mauw": 600,           // top of the envelope
  "minMass": 325,        // bottom of the chart
  "fwdArm": 270,         // forward limit below the knee, mm
  "fwdKneeMass": 400,    // where the forward limit stops being a constant CG line
  "fwdArmAtMauw": 319,   // forward limit at MTOM, mm
  "aftArm": 398,         // aft limit, mm
  "cautionOffset": 14.876 // width of the caution zone, kg·m inboard of the aft limit
}
```

This reproduces Jonker's `Config` sheet vertex-for-vertex, for both the 18 m and
15 m envelopes.

**Arms that move.** Most loading points have a fixed arm. The main wing tank
does not — its CG travels as the tank fills, so its arm is a 6th-order
polynomial in the water mass, lifted from the `Main Water Ballast` sheet. Any
loading point can use one:

```json
{ "id": "H2OMain", "max": 156, "armPoly": "h2oMain" }
```

with the coefficients under `armPolynomials`, ascending powers, piecewise.

**Flags on a loading point:**

- `expendable` — subtracted for the "ballast dumped" case.
- `nonLifting` — counted against the non-lifting mass limit.
- `locked` — driven by the weighing, not by you (the empty aircraft).
- `hidden` — in the profile but off the entry screen, like the fixed tail lead.

---

## What it checks

Both the take-off point *and* the ballast-dumped point, against:

- maximum take-off mass
- forward limit, interpolated along the kinked boundary at your actual mass
- aft limit
- caution zone
- minimum mass on the chart
- non-lifting mass
- per-item maximum load

The 15 m configuration ships defined but unweighed, as a worked example of a
second configuration. Enter M1 and M2 for it under Setup and it becomes live.

---

## Two things to confirm with Jonker

Faithfulness to the source beat consistency wherever the two disagreed, so
these carry through from the workbook rather than being smoothed over:

1. **The 15 m sheet uses a fixed 247 mm arm for the main water tank; the 18 m
   sheet uses the polynomial.** At full tanks the two agree to 0.1 mm, so it
   makes no practical difference, but it looks like the 15 m sheet simply was
   not updated. The profile reproduces both as found.
2. **`emptyNonLifting` is 163.1 kg**, from the fuselage (158) plus tailplane
   (5.1) on the component list. The workbook's own non-lifting total is
   suppressed for an 18 m-only aircraft, so there is nothing to check it
   against. Verify it before treating that particular limit as binding.
