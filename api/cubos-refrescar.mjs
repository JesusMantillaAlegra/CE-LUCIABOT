// GET/POST /api/cubos-refrescar
//
// Recalcula en vivo (contra HubSpot) los cubos mensuales de Correo y
// Llamadas que faltan en el histórico o que todavía pueden cambiar, y los
// guarda en el mismo KV que ya lee el tablero (mismo id que los snapshots
// mensuales manuales: correo-month-YYYY-MM / llamadas-month-YYYY-MM) -- ver
// lib/cubos.mjs para el detalle completo. No toca Chat todavía (embudo
// bloqueado, ver nota en lib/cubos.mjs).
//
// Lo dispara un cron de Vercel (ver vercel.json). También se puede llamar a
// mano para forzar un refresco/backfill fuera de horario.
//
// PRESUPUESTO DE TIEMPO: igual que ce-retention-soporte-ops/api/cubos-refrescar.mjs
// -- calcular un mes desde cero contra HubSpot tarda bastante (varias
// llamadas paginadas + owner-history para Correo). 240s de presupuesto bajo
// el maxDuration:300 de vercel.json. Si no alcanza para todos los meses, la
// respuesta trae "pendientes": volver a llamar retoma justo donde se quedó,
// no repite lo ya guardado.
//
// SEGURIDAD: igual que /api/seed y /api/limpiar-historico -- exige
// Authorization: Bearer <CRON_SECRET>, y se niega a correr si esa variable
// no está configurada.

import { leerHistorico } from "../lib/store.mjs";
import { refrescarCubos } from "../lib/cubos.mjs";

const PRESUPUESTO_MS = 240_000;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Falta CRON_SECRET en las variables de entorno del proyecto. Este endpoint no corre sin él." });
  }
  const auth = req.headers.authorization || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || req.query?.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: "No autorizado" });
  }
  if (!process.env.HUBSPOT_TOKEN) {
    return res.status(500).json({ error: "Falta HUBSPOT_TOKEN" });
  }

  try {
    const historico = await leerHistorico();
    const { resultados, pendientes, total_tareas, faltantes, inestables } = await refrescarCubos({ historico, presupuestoMs: PRESUPUESTO_MS });

    const conError = resultados.filter((r) => !r.ok);
    return res.status(conError.length ? 207 : 200).json({
      ok: conError.length === 0 && pendientes.length === 0,
      total_tareas,
      faltantes_al_empezar: faltantes,
      inestables_al_empezar: inestables,
      procesados: resultados.length,
      con_error: conError.length,
      pendientes,
      nota_pendientes: pendientes.length ? "Llamá al endpoint de nuevo -- retoma donde se quedó, no repite lo ya guardado." : undefined,
      resultados,
    });
  } catch (e) {
    return res.status(500).json({ error: "Falló el refresco de cubos", detalle: String(e.message ?? e) });
  }
}
