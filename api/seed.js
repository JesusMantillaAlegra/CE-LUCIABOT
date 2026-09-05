// api/seed.js
//
// POST /api/seed
//
// Siembra el histórico en KV con los snapshots que ya existían en
// lucia_dashboard_history.json en el repo, ANTES de mover el cron a KV.
// Se corre una sola vez al migrar -- sin esto, el histórico en KV
// arrancaría vacío y se perderían todas las semanas ya capturadas.
//
// Requiere el mismo CRON_SECRET que usa el cron semanal (escribe en el
// store). Se niega a correr si KV ya tiene snapshots, salvo que se pase
// ?forzar=1 -- para no pisar por accidente datos que ya estén en KV.
//
// Uso (una sola vez, después de tener HUBSPOT... digo, CRON_SECRET y el
// Redis conectados en Vercel):
//   curl -X POST "https://<tu-dominio>/api/seed" -H "Authorization: Bearer <CRON_SECRET>"

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { leerHistorico, reemplazarHistorico } from "../lib/store.mjs";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: "Falta CRON_SECRET" });
  const auth = req.headers.authorization || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || req.query?.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const existente = await leerHistorico();
    const forzar = req.query?.forzar === "1";
    if (existente.length && !forzar) {
      return res.status(409).json({
        error: `KV ya tiene ${existente.length} snapshots. Si de verdad querés reemplazarlos, llamar con ?forzar=1`,
        snapshots_actuales: existente.map((s) => s.semana_inicio),
      });
    }

    const ruta = join(process.cwd(), "lucia_dashboard_history.json");
    const raw = JSON.parse(await readFile(ruta, "utf8"));
    const semilla = Array.isArray(raw) ? raw : raw.snapshots;
    if (!Array.isArray(semilla)) {
      return res.status(500).json({ error: "lucia_dashboard_history.json no tiene un array de snapshots (ni directo ni bajo .snapshots)" });
    }

    const { total } = await reemplazarHistorico(semilla);
    return res.status(200).json({
      ok: true,
      total_snapshots: total,
      snapshots: semilla.map((s) => s.semana_inicio),
    });
  } catch (e) {
    return res.status(500).json({ error: "Falló la siembra", detalle: String(e.message ?? e) });
  }
}
