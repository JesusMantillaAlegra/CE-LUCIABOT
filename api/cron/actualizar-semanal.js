// api/cron/actualizar-semanal.js
//
// Job semanal (Vercel Cron, ver vercel.json — corre los miércoles) que:
//   1. Calcula la última semana completa (lunes a domingo) ya cerrada.
//   2. Trae Correo y Llamadas directo de la API de HubSpot con los filtros REALES
//      verificados en INSTRUCTIVO.md (secciones 1.10, 1.6 y 7).
//   3. Trae Llamadas (lado técnico) de la API de ElevenLabs.
//   4. Arma un snapshot nuevo con la MISMA forma que ya usa lucia_dashboard_history.json
//      y lo agrega (nunca reemplaza) al array `snapshots`, vía la API de GitHub.
//   5. Regenera lucia_dashboard_history.js a partir del JSON actualizado.
//
// ⚠️ Chat (Lucía Chat) NO se automatiza acá — sigue siendo 100% manual. La
// investigación documentada en INSTRUCTIVO.md 1.11/1.12 confirmó que casi todos sus
// widgets dependen del objeto Conversations de HubSpot, al que este token no tiene
// acceso todavía (hace falta un scope de Conversations API que hoy no está confirmado
// que exista). El día que se consiga ese scope, hay que extender este mismo archivo.
//
// Variables de entorno requeridas (configurarlas en Vercel → Project → Settings →
// Environment Variables, nunca hardcodeadas — ver INSTRUCTIVO.md 1.13):
//   HUBSPOT_TOKEN   Private App token de HubSpot (scopes: tickets.read, calls.read)
//   XI_API_KEY      API key de ElevenLabs
//   GITHUB_TOKEN    Fine-grained PAT con "Contents: Read and write" sobre este repo
//   GITHUB_REPO     "owner/nombre-repo"
//   GITHUB_BRANCH   opcional, default "main"
//   CRON_SECRET     string secreta cualquiera — protege el endpoint (ver abajo)

import {
  correoGestionadosCount,
  correoEscaladosCount,
  correoPorStage,
  correoCsatSemana,
  resolvePipelineStageLabels,
  llamadasPorVersion,
} from "../../lib/hubspot.js";
import { fetchElevenlabsLlamadas } from "../../lib/elevenlabs.js";
import { getFile, putFile } from "../../lib/github.js";

const HISTORY_JSON_PATH = "lucia_dashboard_history.json";
const HISTORY_JS_PATH = "lucia_dashboard_history.js";
const ELEVENLABS_CONFIG_PATH = "elevenlabs_config.json";

// ---------- semana a capturar: última semana completa (lunes-domingo) ya cerrada ----------
function lastCompleteWeek(today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const thisMonday = new Date(d);
  thisMonday.setUTCDate(d.getUTCDate() - diffToMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return [fmt(lastMonday), fmt(thisMonday)]; // [inicio inclusive, fin EXCLUSIVO = este lunes]
}
function fmt(d) { return d.toISOString().slice(0, 10); }

function etiquetaSemana(inicioISO, finExclusivoISO) {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [y1, m1, d1] = inicioISO.split("-").map(Number);
  const finInclusive = new Date(Date.parse(`${finExclusivoISO}T00:00:00Z`) - 86400000);
  const d2 = finInclusive.getUTCDate(), m2 = finInclusive.getUTCMonth() + 1;
  return `${d1} – ${d2} ${meses[m2 - 1]} ${y1}`;
}

export default async function handler(req, res) {
  // ---------- seguridad: exige el secreto compartido ----------
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const providedSecret = auth.replace(/^Bearer\s+/i, "") || req.query?.secret;
  if (secret && providedSecret !== secret) {
    return res.status(401).json({ error: "No autorizado." });
  }

  const log = [];
  try {
    const [semanaInicio, semanaFinExclusive] = lastCompleteWeek();
    const semanaFinInclusive = fmt(new Date(Date.parse(`${semanaFinExclusive}T00:00:00Z`) - 86400000));
    log.push(`Semana a capturar: ${semanaInicio} a ${semanaFinInclusive}`);

    // ---------- 1. leer historial actual de GitHub ----------
    const { content: historyRaw, sha: historySha } = await getFile(HISTORY_JSON_PATH);
    const history = JSON.parse(historyRaw);

    // idempotencia: no duplicar si ya existe un snapshot para esta semana
    const yaExiste = (history.snapshots || []).some((s) => s.semana_inicio === semanaInicio && s.correo);
    if (yaExiste) {
      log.push(`Ya existe un snapshot de Correo/Llamadas para ${semanaInicio} — no se agrega otro.`);
      return res.status(200).json({ ok: true, skipped: true, log });
    }

    // ---------- 2. Correo (HubSpot) ----------
    log.push("Trayendo Correo de HubSpot...");
    const [gestionados, escalados, porStageCounts, csatSemana] = await Promise.all([
      correoGestionadosCount(semanaInicio, semanaFinExclusive),
      correoEscaladosCount(semanaInicio, semanaFinExclusive),
      correoPorStage(semanaInicio, semanaFinExclusive),
      correoCsatSemana(semanaInicio, semanaFinExclusive),
    ]);
    const porStage = await resolvePipelineStageLabels(porStageCounts);
    const correo = {
      kpis: {
        // demanda y pct_gestion de Correo dependen de Conversations (bloqueado, ver
        // INSTRUCTIVO 1.10) — quedan null; hay que seguir capturándolos a mano en
        // HubSpot hasta que se consiga el scope de Conversations API.
        demanda: null,
        gestionados,
        escalados,
        pct_gestion: null,
      },
      por_stage: porStage,
      tendencia_semanal: [{ semana: semanaInicio, escaladas: escalados, gestionadas: gestionados }],
      csat: {
        nota: "Ver INSTRUCTIVO.md sección 1.6 — no hay puntaje 1-10, solo Promoter/Passive/Detractor. Scope: pipelines de Correo en general, sin filtro de owner.",
        serie_semanal: [{ semana: semanaInicio, ...csatSemana }],
      },
    };
    log.push(`Correo: gestionados=${gestionados}, escalados=${escalados}, csat_respuestas=${csatSemana.promoter + csatSemana.passive + csatSemana.detractor}`);

    // ---------- 3. Llamadas (HubSpot + ElevenLabs) ----------
    log.push("Trayendo Llamadas de HubSpot...");
    const { porVersion, motivo_escalamiento } = await llamadasPorVersion(semanaInicio, semanaFinExclusive);
    const kpisLlamadas = porVersion.reduce(
      (acc, v) => ({
        demanda: acc.demanda + v.demanda,
        gestionadas: acc.gestionadas + v.gestionadas,
        escaladas: acc.escaladas + v.escaladas,
        no_contestadas: acc.no_contestadas + v.no_contestadas,
        sin_clasificar: acc.sin_clasificar + v.sin_clasificar,
      }),
      { demanda: 0, gestionadas: 0, escaladas: 0, no_contestadas: 0, sin_clasificar: 0 }
    );
    const durPonderada = porVersion.reduce((a, v) => a + (v.duracion_prom_seg || 0) * v.demanda, 0);
    kpisLlamadas.pct_gestion = kpisLlamadas.demanda ? +((100 * kpisLlamadas.gestionadas) / kpisLlamadas.demanda).toFixed(2) : 0;
    kpisLlamadas.duracion_prom_seg = kpisLlamadas.demanda ? +(durPonderada / kpisLlamadas.demanda).toFixed(1) : null;
    log.push(`Llamadas: demanda=${kpisLlamadas.demanda}, gestionadas=${kpisLlamadas.gestionadas}, escaladas=${kpisLlamadas.escaladas}`);

    log.push("Trayendo Llamadas de ElevenLabs...");
    const { content: elevenlabsConfigRaw } = await getFile(ELEVENLABS_CONFIG_PATH);
    const elevenlabsConfig = JSON.parse(elevenlabsConfigRaw);
    const elevenlabs = await fetchElevenlabsLlamadas(elevenlabsConfig, semanaInicio, semanaFinExclusive);

    const llamadas = {
      kpis: kpisLlamadas,
      por_version: porVersion,
      motivo_escalamiento,
      elevenlabs,
    };

    // ---------- 4. armar y agregar el snapshot nuevo ----------
    const nuevoSnapshot = {
      id: `wk-${semanaInicio}`,
      semana_inicio: semanaInicio,
      semana_fin: semanaFinInclusive,
      generado: fmt(new Date()),
      bootstrap: false,
      automatico: true,
      etiqueta: etiquetaSemana(semanaInicio, semanaFinExclusive),
      correo,
      chat: null, // Chat sigue siendo manual — ver nota arriba y INSTRUCTIVO 1.11/1.12
      llamadas,
    };
    history.snapshots = [...(history.snapshots || []), nuevoSnapshot];

    // ---------- 5. escribir de vuelta a GitHub (JSON + JS regenerado) ----------
    const historyJsonStr = JSON.stringify(history, null, 2) + "\n";
    await putFile(
      HISTORY_JSON_PATH,
      historyJsonStr,
      `Snapshot automático semana ${semanaInicio} (Correo + Llamadas)`,
      historySha
    );

    const { sha: historyJsSha } = await getFile(HISTORY_JS_PATH).catch(() => ({ sha: undefined }));
    const historyJsStr = `window.LUCIA_HISTORY = ${JSON.stringify(history, null, 2)};\n`;
    await putFile(
      HISTORY_JS_PATH,
      historyJsStr,
      `Regenera lucia_dashboard_history.js (snapshot automático ${semanaInicio})`,
      historyJsSha
    );

    log.push(`Snapshot ${nuevoSnapshot.id} agregado y pusheado a GitHub.`);
    return res.status(200).json({ ok: true, snapshot: nuevoSnapshot, log });
  } catch (err) {
    log.push(`ERROR: ${err.message}`);
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message, log });
  }
}
