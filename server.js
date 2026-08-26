/* Minimal sync endpoint. Node 18+, Express 4, node-postgres.
   npm i express pg
   DATABASE_URL=postgres://... WB_TOKEN=some-long-secret node server.js

   Two routes, that is all the app needs:
     GET  /api/flights?since=<iso>   -> { flights: [...] }   rows newer than the cursor
     POST /api/flights               <- { flights: [...] }   upsert, last write wins
*/
const express = require("express");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TOKEN = process.env.WB_TOKEN;
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", process.env.WB_ORIGIN || "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// One shared token is fine for a single pilot. Swap for real auth before
// anyone else gets the URL, and set `owner` from the verified identity.
app.use("/api", (req, res, next) => {
  if (!TOKEN) return next();
  const got = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (got !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
});
const ownerOf = (req) => req.get("x-owner") || "default";

app.get("/api/flights", async (req, res) => {
  try {
    const since = req.query.since || "1970-01-01T00:00:00Z";
    const { rows } = await pool.query(
      `select id, registration, serial, config, date, site, mass, moment, cg,
              wing_loading as "wingLoading", dumped_mass as "dumpedMass",
              dumped_cg as "dumpedCg", pilot, water_main as "waterMain",
              water_tips as "waterTips", loads, duration_h as "durationH",
              distance_km as "distanceKm", avg_speed as "avgSpeed",
              conditions, notes, updated_at as "updatedAt"
         from flights
        where owner = $1 and updated_at > $2
        order by updated_at asc limit 1000`,
      [ownerOf(req), since]
    );
    res.json({ flights: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "read failed" }); }
});

app.post("/api/flights", async (req, res) => {
  const list = Array.isArray(req.body.flights) ? req.body.flights : [];
  if (!list.length) return res.json({ upserted: 0 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const f of list) {
      await client.query(
        `insert into flights (id, owner, registration, serial, config, date, site,
            mass, moment, cg, wing_loading, dumped_mass, dumped_cg, pilot,
            water_main, water_tips, loads, duration_h, distance_km, avg_speed,
            conditions, notes, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
                 coalesce($23::timestamptz, now()))
         on conflict (id) do update set
            registration=excluded.registration, serial=excluded.serial,
            config=excluded.config, date=excluded.date, site=excluded.site,
            mass=excluded.mass, moment=excluded.moment, cg=excluded.cg,
            wing_loading=excluded.wing_loading, dumped_mass=excluded.dumped_mass,
            dumped_cg=excluded.dumped_cg, pilot=excluded.pilot,
            water_main=excluded.water_main, water_tips=excluded.water_tips,
            loads=excluded.loads, duration_h=excluded.duration_h,
            distance_km=excluded.distance_km, avg_speed=excluded.avg_speed,
            conditions=excluded.conditions, notes=excluded.notes,
            updated_at=excluded.updated_at
         where flights.updated_at <= excluded.updated_at`,
        [f.id, ownerOf(req), f.registration, f.serial, f.config, f.date, f.site,
         f.mass, f.moment, f.cg, f.wingLoading, f.dumpedMass, f.dumpedCg, f.pilot,
         f.waterMain, f.waterTips, JSON.stringify(f.loads || {}), f.durationH,
         f.distanceKm, f.avgSpeed, f.conditions, f.notes, f.updatedAt]
      );
    }
    await client.query("commit");
    res.json({ upserted: list.length });
  } catch (e) {
    await client.query("rollback");
    console.error(e); res.status(500).json({ error: "write failed" });
  } finally { client.release(); }
});

// Serve the app itself from the same origin, so the service worker scope matches.
app.use(express.static(__dirname, { extensions: ["html"] }));
app.listen(process.env.PORT || 8080, () =>
  console.log("W&B sync on :" + (process.env.PORT || 8080)));
