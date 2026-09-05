// api/history.js
//
// GET /api/history
//
// Devuelve el histórico de snapshots (uno por semana) tal como lo espera hoy
// index.html: { snapshots: [...] }. Antes esto se leía como archivo estático
// (lucia_dashboard_history.js / .json) del repo; ahora vive en KV (ver
// lib/store.mjs) para no depender de un commit+push cada vez que corre el
// cron ni de que el archivo del repo esté sincronizado con lo real.
//
// Si el histórico todavía está vacío (o KV no está configurado) devuelve un
// array vacío en vez de un error de 500: index.html ya sabe mostrar el
// mensaje de "no hay datos" en ese caso (ver runRender() -> `if (!HISTORY.length)`).

import { leerHistorico } from "../lib/store.mjs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const snapshots = await leerHistorico();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    return res.status(200).json({ snapshots });
  } catch (e) {
    console.error("No se pudo leer el histórico de KV:", e);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ snapshots: [] });
  }
}
