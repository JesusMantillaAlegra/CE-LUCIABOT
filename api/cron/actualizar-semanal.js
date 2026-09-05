// api/cron/actualizar-semanal.js
//
// Job semanal (Vercel Cron, ver vercel.json — corre los miércoles) que:
//   1. Calcula la última semana completa (lunes a domingo) ya cerrada.
//   2. Trae Correo y Llamadas directo de la API de HubSpot con los filtros REALES
//      verificados en INSTRUCTIVO.md (secciones 1.10, 1.6 y 7).
//   3. Trae Llamadas (lado técnico) de la API de ElevenLabs.
//   4. Arma un snapshot nuevo con la MISMA forma que ya tenía cada entrada de
//      lucia_dashboard_history.json y lo agrega (nunca reemplaza, salvo ?force=true)
//      al histórico guardado en KV (Redis) -- ver lib/store.mjs.
//
// ✅ MIGRADO 05-sep-2026: el histórico ya NO se guarda como archivo en el repo (ni el
// .json ni el .js regenerado) vía la API de GitHub -- ahora vive en el mismo Redis
// (Vercel KV / Upstash) que ya usa ce-retention-soporte-ops, conectado también a este
// proyecto (Storage → Connect Project), bajo el prefijo "lucia:" para no pisar esos
// datos. index.html lee el histórico llamando a GET /api/history (ver ese archivo),
// que a su vez lee de KV -- ya no depende de que este cron haga commit+push a GitHub.
// lucia_dashboard_history.json en el repo quedó como semilla histórica para /api/seed
// (una sola vez) y como respaldo local si alguien abre index.html con file://.
//
// ✅ ACTUALIZADO 05-sep-2026: se consiguió el scope de Conversations (REVSYS-573) y se
// validó que el token nuevo lee /conversations/v3/conversations/{inboxes,threads} (HTTP
// 200). Correo (Demanda/Gestionados/Escalados/Tiempo prom.) ya está 100% por API, sin
// Breeze ni MCP. Chat ya trae Demanda por API (chatDemandaCount, ver lib/hubspot.js, con
// el fix de paginación/orden del 05-sep-2026) -- Ingresados/Gestionados/Escalados/CSAT/
// Tiempo de Chat siguen bloqueados porque aún no se identifica qué propiedad de la
// Conversations API marca "atendido por bot" (ver chatIngresadosGestionadosEscalados() en
// lib/hubspot.js, que lanza error a propósito en vez de adivinar un número). Esos campos
// se dejan en null en el snapshot hasta resolver eso -- ver METRICAS_TABLERO_LUCIA.md.
//
// Variables de entorno requeridas (configurarlas en Vercel → Project → Settings →
// Environment Variables, nunca hardcodeadas — ver INSTRUCTIVO.md 1.13):
//   HUBSPOT_TOKEN               Private App token de HubSpot (scopes: tickets.read,
//                                calls.read, conversations.read + Conversation/
//                                Conversation session -- REVSYS-573)
//   XI_API_KEY                  API key de ElevenLabs
//   GITHUB_TOKEN, GITHUB_REPO   Solo para leer elevenlabs_config.json del repo (ya no
//                                para el histórico) -- GITHUB_BRANCH opcional, default "main"
//   KV_REST_API_URL/TOKEN       (o UPSTASH_REDIS_REST_URL/TOKEN) -- inyectadas solas al
//                                conectar el Redis compartido con Retention (ver lib/store.mjs)
//   CRON_SECRET                 string secreta cualquiera — protege el endpoint (ver abajo)

import {
  correoGestionadosCount,
  correoEscaladosCount,
  correoDemandaCount,
  correoTiempoPromedioGestionMin,
  correoPorStage,
  correoCsatSemana,
  resolvePipelineStageLabels,
  llamadasPorVersion,
  chatDemandaCount,
} from "../../lib/hubspot.js";
import { fetchElevenlabsLlamadas } from "../../lib/elevenlabs.js";
import { getFile } from "../../lib/github.js";
import { leerHistorico, guardarSnapshot } from "../../lib/store.mjs";

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
    // Por default calcula la última semana completa (lunes-domingo) ya cerrada. Se puede
    // forzar una ventana específica con ?semanaInicio=YYYY-MM-DD&semanaFin=YYYY-MM-DD
    // (ambas inclusive) — usado para reprocesar/corregir una semana puntual.
    const overrideInicio = req.query?.semanaInicio;
    const overrideFin = req.query?.semanaFin;
    let semanaInicio, semanaFinExclusive;
    if (overrideInicio && overrideFin) {
      semanaInicio = overrideInicio;
      semanaFinExclusive = fmt(new Date(Date.parse(`${overrideFin}T00:00:00Z`) + 86400000));
      log.push(`Semana forzada manualmente vía query params: ${semanaInicio} a ${overrideFin}`);
    } else {
      [semanaInicio, semanaFinExclusive] = lastCompleteWeek();
    }
    const semanaFinInclusive = fmt(new Date(Date.parse(`${semanaFinExclusive}T00:00:00Z`) - 86400000));
    log.push(`Semana a capturar: ${semanaInicio} a ${semanaFinInclusive}`);

    // ---------- 1. leer historial actual de KV ----------
    const history = await leerHistorico(); // array plano de snapshots, ya ordenado

    const force = req.query?.force === "true" || req.headers["x-force-reprocess"] === "true";

    // Guarda contra traslapes: si la semana a capturar empieza antes o el mismo día en que
    // termina la cobertura más reciente que ya existe en el histórico (de OTRO snapshot),
    // los mismos tickets quedarían contados dos veces en los KPIs acumulados. Esto pasó una
    // vez (25/27-ago-2026, ver INSTRUCTIVO 8) porque el snapshot inicial cubría hasta el
    // 19-ago y la primera semana automática arrancó en 17-ago, traslapando 3 días.
    const coberturaMax = history
      .filter((s) => s.correo && s.semana_fin && s.semana_inicio !== semanaInicio)
      .reduce((max, s) => (s.semana_fin > max ? s.semana_fin : max), "0000-00-00");
    if (coberturaMax !== "0000-00-00" && semanaInicio <= coberturaMax && !overrideInicio) {
      const msg = `La semana calculada (${semanaInicio}) se traslapa con cobertura que ya existe hasta ${coberturaMax} — se aborta para no duplicar tickets. Si esto pasa en una corrida normal del cron, hay que revisar por qué (¿se saltó una semana? ¿cambió el huso horario?).`;
      log.push(`ERROR: ${msg}`);
      return res.status(409).json({ ok: false, error: msg, log });
    }

    // idempotencia: no duplicar si ya existe un snapshot para esta semana — salvo que se
    // pase ?force=true (o header X-Force-Reprocess: true), que REEMPLAZA ese snapshot en
    // vez de agregar uno nuevo. Útil para reprocesar una semana si se corrige un bug.
    const yaExiste = history.some((s) => s.semana_inicio === semanaInicio && s.correo);
    if (yaExiste && !force) {
      log.push(`Ya existe un snapshot de Correo/Llamadas para ${semanaInicio} — no se agrega otro (usa ?force=true para reemplazarlo).`);
      return res.status(200).json({ ok: true, skipped: true, log });
    }

    // ---------- 2. Correo (HubSpot) ----------
    log.push("Trayendo Correo de HubSpot...");
    const [demanda, gestionados, escalados, porStageCounts, csatSemana, tiempoPromedioGestionMin] = await Promise.all([
      correoDemandaCount(semanaInicio, semanaFinExclusive),
      correoGestionadosCount(semanaInicio, semanaFinExclusive),
      correoEscaladosCount(semanaInicio, semanaFinExclusive),
      correoPorStage(semanaInicio, semanaFinExclusive),
      correoCsatSemana(semanaInicio, semanaFinExclusive),
      correoTiempoPromedioGestionMin(semanaInicio, semanaFinExclusive),
    ]);
    const porStage = await resolvePipelineStageLabels(porStageCounts);
    const correo = {
      kpis: {
        // Corregido 03-sep-2026: demanda ya sale por API directa (correoDemandaCount) --
        // antes se pensaba que dependía de Conversations, pero solo necesita
        // source_type=EMAIL + Pipeline=COL_Sup (mismo alcance ya validado de
        // Gestionados/Escalados, ver lib/hubspot.js).
        demanda,
        gestionados,
        escalados,
        pct_gestion: demanda ? +((100 * gestionados) / demanda).toFixed(2) : 0,
        pct_escalados: demanda ? +((100 * escalados) / demanda).toFixed(2) : 0,
      },
      tiempo_promedio_gestion_min: tiempoPromedioGestionMin,
      por_stage: porStage,
      tendencia_semanal: [{ semana: semanaInicio, escaladas: escalados, gestionadas: gestionados }],
      csat: {
        nota: "Ver INSTRUCTIVO.md sección 1.6 — no hay puntaje 1-10, solo Promoter/Passive/Detractor. Scope: pipelines de Correo en general, sin filtro de owner.",
        serie_semanal: [{ semana: semanaInicio, ...csatSemana }],
      },
    };
    log.push(`Correo: demanda=${demanda}, gestionados=${gestionados}, escalados=${escalados}, tiempo_prom_min=${tiempoPromedioGestionMin}, csat_respuestas=${csatSemana.promoter + csatSemana.passive + csatSemana.detractor}`);

    // ---------- 3. Llamadas (HubSpot + ElevenLabs) ----------
    log.push("Trayendo Llamadas de HubSpot...");
    const { porVersion, motivo_escalamiento, otros_raw_debug } = await llamadasPorVersion(semanaInicio, semanaFinExclusive);
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
    if (otros_raw_debug.length) {
      log.push(`⚠️ ${otros_raw_debug.reduce((a, o) => a + o.count, 0)} llamadas escaladas cayeron en "Otro" — textos crudos no reconocidos: ${JSON.stringify(otros_raw_debug)}`);
    }

    // ElevenLabs es solo un cruce técnico de control de calidad (duración, % sin error
    // técnico) — las métricas de negocio (gestionadas/escaladas/demanda) ya están
    // completas con lo de HubSpot arriba. Si ElevenLabs falla (token vencido, rate
    // limit, etc.) el snapshot se guarda igual, sin ese bloque, en vez de perder toda
    // la corrida por un dato que es secundario. La config de ElevenLabs sigue viviendo
    // en el repo (GitHub) -- es configuración estática, no histórico, no hace falta KV.
    log.push("Trayendo Llamadas de ElevenLabs...");
    let elevenlabs = null;
    try {
      const { content: elevenlabsConfigRaw } = await getFile(ELEVENLABS_CONFIG_PATH);
      const elevenlabsConfig = JSON.parse(elevenlabsConfigRaw);
      elevenlabs = await fetchElevenlabsLlamadas(elevenlabsConfig, semanaInicio, semanaFinExclusive);
    } catch (err) {
      log.push(`ElevenLabs falló (no crítico, se sigue sin ese bloque): ${err.message}`);
    }

    const llamadas = {
      kpis: kpisLlamadas,
      por_version: porVersion,
      motivo_escalamiento,
      elevenlabs,
    };

    // ---------- 3b. Chat (HubSpot Conversations API) — solo de monitoreo por ahora ----------
    // chatDemandaCount ya funciona por API (fix de paginación/orden del 05-sep-2026), pero
    // NO se guarda todavía dentro de `chat` en el snapshot: renderChat() en index.html solo
    // sabe pintar el objeto `chat` completo (Demanda + Ingresados + Gestionados + Escalados
        // + CSAT) o nada (`chat: null` → "No hay datos"). No sabe pintar un Chat parcial, así
    // que guardar aquí un objeto con Ingresados/Gestionados/Escalados en null rompería las
    // tarjetas del tablero (mostrarían cosas como "0.0% de la demanda", que es falso, no
    // "sin dato"). Por eso Demanda de Chat se calcula y se deja en el log del cron para
    // monitoreo/confirmación, y `chat` se sigue guardando como null hasta que también estén
    // Ingresados/Gestionados/Escalados (ver chatIngresadosGestionadosEscalados() en
    // lib/hubspot.js) Y renderChat() en index.html sepa pintar un Chat parcial -- ahí se
    // arma el objeto `chat` real y se activa esta sección.
    log.push("Trayendo Chat (Demanda) de HubSpot Conversations — solo para monitoreo, no se guarda en el snapshot todavía...");
    try {
      const demandaChat = await chatDemandaCount(semanaInicio, semanaFinExclusive);
      log.push(`Chat (Demanda, no guardado): ${demandaChat}`);
    } catch (err) {
      log.push(`⚠️ Chat (Demanda) falló (no crítico, no se guarda en el snapshot todavía): ${err.message}`);
    }

    // ---------- 4. armar el snapshot nuevo ----------
    const nuevoSnapshot = {
      id: `wk-${semanaInicio}`,
      semana_inicio: semanaInicio,
      semana_fin: semanaFinInclusive,
      generado: fmt(new Date()),
      bootstrap: false,
      automatico: true,
      etiqueta: etiquetaSemana(semanaInicio, semanaFinExclusive),
      correo,
      chat: null, // ver nota arriba — Demanda ya sale por API pero no se guarda hasta tener el objeto completo
      llamadas,
    };

    // ---------- 5. guardar en KV (Redis compartido con Retention, prefijo "lucia:") ----------
    const resultado = await guardarSnapshot(nuevoSnapshot, { force: force && yaExiste });
    log.push(
      force && yaExiste
        ? `Snapshot ${nuevoSnapshot.id} reemplazado en KV (force=true). Total snapshots: ${resultado.total}.`
        : `Snapshot ${nuevoSnapshot.id} agregado a KV. Total snapshots: ${resultado.total}.`
    );

    return res.status(200).json({ ok: true, snapshot: nuevoSnapshot, log });
  } catch (err) {
    log.push(`ERROR: ${err.message}`);
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message, log });
  }
}
