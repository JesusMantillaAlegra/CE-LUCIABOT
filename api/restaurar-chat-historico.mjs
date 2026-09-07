// POST /api/restaurar-chat-historico
//
// Uso ÚNICO, de una sola vez (07-sep-2026): la corrida de cubos-refrescar de hoy generó
// en vivo chat-month-2026-02 y chat-month-2026-03 con hubspot_owner_id=89503870 -- y
// HubSpot devolvió 0 gestionados/0 escalados reales para esos dos meses (confirmado con
// diagnosticar_gestionados_por_mes.mjs). Conclusión con Jesús: el mecanismo de tracking
// por owner_id/inbox_id_objetivo no captura actividad tan atrás -- no es que Lucía no
// gestionara nada en feb/mar (sí lo hacía, ver Estado actual Bot Lucía 19-jun-2026 en la
// wiki), es que el tracking actual no llega hasta ahí. Desde abril en adelante SÍ se deja
// lo que devuelva HubSpot en vivo (decisión de Jesús, 07-sep-2026).
//
// Este endpoint restaura esos dos snapshots a los valores originales generados por Breeze
// (INSTRUCTIVO/HubSpot AI, 28-ago-2026) -- los mismos que tenía el tablero antes de la
// corrida de hoy. Después de correrlo una vez, lib/cubos.mjs ya no vuelve a tocar estos
// dos meses (CHAT_INICIO se movió a 2026-04-01), así que no hace falta dejarlo programado
// ni volver a llamarlo.
//
// SEGURIDAD: igual que /api/cubos-refrescar -- exige Authorization: Bearer <CRON_SECRET>.

import { guardarSnapshot } from "../lib/store.mjs";

const SNAPSHOTS = [
  {
    id: "chat-month-2026-02",
    semana_inicio: "2026-02-01",
    semana_fin: "2026-02-28",
    generado: "2026-08-28",
    bootstrap: false,
    etiqueta: "Febrero 2026 (Chat)",
    correo: null,
    llamadas: null,
    chat: {
      kpis: { demanda: 8465, ingresados_bot: 185, escalados: 104, gestionados: 81, pct_escalados: 56.22, pct_gestion: 43.78, csat_bot: 76.9 },
      csat_bot_detalle: { positivas: 10, total: 13, pct: 76.9 },
      ingresados_por_version: [
        { version: "MEX", count: 0 },
        { version: "DOM", count: 0 },
        { version: "CRI", count: 0 },
        { version: "VEN", count: 0 },
        { version: "COL", count: 0 },
      ],
      tiempo_promedio_solucion_min: null,
      motivos_solicitud: {},
      _nota_restaurado_07sep2026: "Restaurado el 07-sep-2026 a su valor original de Breeze (28-ago-2026) -- el cubo en vivo lo había sobrescrito con ceros porque el tracking por hubspot_owner_id/inbox_id_objetivo no captura actividad de Lucía tan atrás. Ver METRICAS_TABLERO_LUCIA.md / conversación con Jesús 07-sep-2026. Chat en vivo arranca desde abril 2026 (CHAT_INICIO en lib/cubos.mjs).",
    },
  },
  {
    id: "chat-month-2026-03",
    semana_inicio: "2026-03-01",
    semana_fin: "2026-03-31",
    generado: "2026-08-28",
    bootstrap: false,
    etiqueta: "Marzo 2026 (Chat)",
    correo: null,
    llamadas: null,
    chat: {
      kpis: { demanda: 9377, ingresados_bot: 553, escalados: 350, gestionados: 203, pct_escalados: 63.29, pct_gestion: 36.71, csat_bot: 80.8 },
      csat_bot_detalle: { positivas: 21, total: 26, pct: 80.8 },
      ingresados_por_version: [
        { version: "MEX", count: 0 },
        { version: "DOM", count: 0 },
        { version: "CRI", count: 0 },
        { version: "VEN", count: 0 },
        { version: "COL", count: 0 },
      ],
      tiempo_promedio_solucion_min: null,
      motivos_solicitud: {},
      _nota_restaurado_07sep2026: "Restaurado el 07-sep-2026 a su valor original de Breeze (28-ago-2026) -- el cubo en vivo lo había sobrescrito con ceros porque el tracking por hubspot_owner_id/inbox_id_objetivo no captura actividad de Lucía tan atrás. Ver METRICAS_TABLERO_LUCIA.md / conversación con Jesús 07-sep-2026. Chat en vivo arranca desde abril 2026 (CHAT_INICIO en lib/cubos.mjs).",
    },
  },
];

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Falta CRON_SECRET en las variables de entorno del proyecto." });
  }
  const auth = req.headers.authorization || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || req.query?.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const resultados = [];
    for (const snapshot of SNAPSHOTS) {
      const r = await guardarSnapshot(snapshot, { force: true });
      resultados.push({ id: snapshot.id, ok: true, total_historico: r.total });
    }
    return res.status(200).json({ ok: true, restaurados: resultados });
  } catch (e) {
    return res.status(500).json({ error: "Falló la restauración", detalle: String(e.message ?? e) });
  }
}
