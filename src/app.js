import "dotenv/config";
import express from "express";
import cors from "cors";
import { query, withTransaction } from "./db.js";
import { EVENTS, getEvent } from "./events.js";
import { generateRegId } from "./id.js";

const ADMIN_KEY = process.env.ADMIN_KEY || "";
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export const app = express();

// On Vercel the frontend and API are served from the same domain, so CORS
// usually isn't needed at all — CORS_ORIGIN can be left blank. It's kept
// here in case you ever call this API from a different origin.
app.use(cors({ origin: CORS_ORIGIN.length ? CORS_ORIGIN : true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/events", (_req, res) => {
  res.json({ events: EVENTS });
});

// ---------------------------------------------------------------------------
// POST /api/register
// Body: {
//   name, college, email, phone,
//   events: [
//     { eventId },                                        // solo event
//     { eventId, teamName, members: [{name,email,phone}] } // team event — members are the OTHER teammates, not the registrant
//   ]
// }
// Only `email` is strictly required (mandatory per spec). The rest are
// stored as empty strings if left blank, since the shared `registrations`
// table's columns are NOT NULL but do accept ''.
// ---------------------------------------------------------------------------
app.post("/api/register", async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const college = String(body.college || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const rawEvents = Array.isArray(body.events) ? body.events : [];

    if (!email || !isEmail(email)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    // Resolve + validate each selected event, including team rosters.
    const seenIds = new Set();
    const resolvedEvents = [];
    for (const sel of rawEvents) {
      const eventId = typeof sel === "string" ? sel : sel.eventId;
      const ev = getEvent(eventId);
      if (!ev) return res.status(400).json({ error: `Unknown event: ${eventId}` });
      if (seenIds.has(ev.id)) return res.status(400).json({ error: `Duplicate event selection: ${ev.name}` });
      seenIds.add(ev.id);

      let teamName = null;
      let members = [];

      if (ev.type === "team") {
        teamName = typeof sel.teamName === "string" ? sel.teamName.trim() : "";
        const rawMembers = Array.isArray(sel.members) ? sel.members : [];

        for (const m of rawMembers) {
          const mName = String(m?.name || "").trim();
          const mEmail = String(m?.email || "").trim().toLowerCase();
          const mPhone = String(m?.phone || "").trim();
          if (!mName || !mEmail || !mPhone) {
            return res
              .status(400)
              .json({ error: `Fill in name, email and phone for every team member added to ${ev.name}.` });
          }
          if (!isEmail(mEmail)) {
            return res.status(400).json({ error: `Enter a valid email for team member "${mName}" in ${ev.name}.` });
          }
          members.push({ name: mName, email: mEmail, phone: mPhone });
        }

        const teamSize = 1 + members.length; // registrant counts as one member
        if (teamSize > ev.maxSize) {
          return res
            .status(400)
            .json({ error: `${ev.name} allows at most ${ev.maxSize} members (including you); remove ${teamSize - ev.maxSize} member(s).` });
        }
        if (teamSize < ev.minSize) {
          return res
            .status(400)
            .json({ error: `${ev.name} needs at least ${ev.minSize} members (including you); add ${ev.minSize - teamSize} more.` });
        }
      }

      resolvedEvents.push({ ev, teamName, members });
    }

    // phantasm_id is UNIQUE in the shared schema. Generate one, explicitly
    // check it isn't already in the database, and only then insert. Retried
    // a few times in the rare case of a collision (also backed by the
    // UNIQUE constraint itself as a safety net for concurrent requests).
    let regId;
    let registrationId;
    let lastErr;

    for (let attempt = 0; attempt < 8 && !registrationId; attempt++) {
      const candidate = generateRegId();
      const existing = await query("SELECT 1 FROM registrations WHERE phantasm_id = $1", [candidate]);
      if (existing.rowCount > 0) continue; // already taken, try another

      try {
        registrationId = await withTransaction(async (client) => {
          const regResult = await client.query(
            `INSERT INTO registrations
               (phantasm_id, college_name, contact_name, contact_email, contact_phone,
                is_pass, needs_accommodation, total_amount, payment_status)
             VALUES ($1,$2,$3,$4,$5,false,'no',0,'pending')
             RETURNING id`,
            [candidate, college, name, email, phone],
          );
          const dbRegId = regResult.rows[0].id;

          for (const { ev, teamName, members } of resolvedEvents) {
            const entryResult = await client.query(
              `INSERT INTO event_entries
                 (registration_id, event_id, event_name, event_type, event_category, team_name, amount)
               VALUES ($1,$2,$3,$4,$5,$6,0)
               RETURNING id`,
              [dbRegId, ev.id, ev.name, ev.type, ev.category, teamName || null],
            );
            const entryId = entryResult.rows[0].id;

            // The registrant is always a participant of every event they picked.
            await client.query(
              `INSERT INTO participants (event_entry_id, name, email, phone) VALUES ($1,$2,$3,$4)`,
              [entryId, name, email, phone],
            );
            // Plus any additional team members for team events.
            for (const m of members) {
              await client.query(
                `INSERT INTO participants (event_entry_id, name, email, phone) VALUES ($1,$2,$3,$4)`,
                [entryId, m.name, m.email, m.phone],
              );
            }
          }

          return dbRegId;
        });
        regId = candidate;
      } catch (err) {
        if (err.code === "23505" && String(err.detail || "").includes("phantasm_id")) {
          lastErr = err;
          continue; // collided with a concurrent insert — try another ID
        }
        throw err;
      }
    }

    if (!registrationId) {
      throw lastErr || new Error("Could not generate a unique registration ID, please try again.");
    }

    res.status(201).json({ registrationId, regId, events: resolvedEvents.map((r) => r.ev.name) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Simple admin endpoints, protected by a shared-secret header so this can
// stay a single-file/no-login site. Set ADMIN_KEY in the environment and
// pass it back as `X-Admin-Key`.
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(500).json({ error: "ADMIN_KEY is not configured on the server." });
  }
  if (req.get("X-Admin-Key") !== ADMIN_KEY) {
    return res.status(401).json({ error: "Invalid admin key." });
  }
  next();
}

app.get("/api/admin/registrations", requireAdmin, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT r.id, r.phantasm_id, r.college_name, r.contact_name, r.contact_email,
              r.contact_phone, r.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'eventName', ee.event_name,
                    'teamName', ee.team_name,
                    'participants', (
                      SELECT COALESCE(json_agg(json_build_object('name', p.name, 'email', p.email, 'phone', p.phone) ORDER BY p.created_at), '[]')
                        FROM participants p WHERE p.event_entry_id = ee.id
                    )
                  )
                ) FILTER (WHERE ee.event_name IS NOT NULL),
                '[]'
              ) AS events
         FROM registrations r
         LEFT JOIN event_entries ee ON ee.registration_id = r.id
        GROUP BY r.id
        ORDER BY r.created_at DESC`,
    );
    res.json({ registrations: result.rows });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/export.csv", requireAdmin, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT r.phantasm_id, r.college_name, r.contact_name, r.contact_email,
              r.contact_phone, r.created_at,
              COALESCE(string_agg(DISTINCT ee.event_name, '; '), '') AS events,
              COALESCE(
                (SELECT string_agg(DISTINCT p.name || ' <' || p.email || ', ' || p.phone || '>', '; ')
                   FROM event_entries ee2
                   JOIN participants p ON p.event_entry_id = ee2.id
                  WHERE ee2.registration_id = r.id AND p.email <> r.contact_email),
                ''
              ) AS team_members
         FROM registrations r
         LEFT JOIN event_entries ee ON ee.registration_id = r.id
        GROUP BY r.id
        ORDER BY r.created_at DESC`,
    );
    const header = "Reg ID,Name,College,Email,Phone,Events,Team Members,Registered At\n";
    const rows = result.rows.map((r) =>
      [r.phantasm_id, r.contact_name, r.college_name, r.contact_email, r.contact_phone, r.events, r.team_members, r.created_at]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=registrations.csv");
    res.send(header + rows.join("\n"));
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});
