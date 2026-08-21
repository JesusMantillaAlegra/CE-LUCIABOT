/**
 * fetch_elevenlabs_llamadas.mjs
 *
 * Trae de la API de ElevenLabs las llamadas de los agentes de Lucia IVR
 * (definidos en elevenlabs_config.json) para una semana dada, y deja un
 * JSON agregado listo para fusionarse en el snapshot semanal del dashboard
 * (lucia_dashboard_history.json, bloque "llamadas").
 *
 * Requiere Node 18+ (usa fetch nativo).
 *
 * Uso:
 *   XI_API_KEY=sk_...  node fetch_elevenlabs_llamadas.mjs
 *   XI_API_KEY=sk_...  node fetch_elevenlabs_llamadas.mjs --from=2026-08-24 --to=2026-08-30
 *   XI_API_KEY=sk_...  node fetch_elevenlabs_llamadas.mjs --config=./elevenlabs_config.json
 *
 * En PowerShell:
 *   $env:XI_API_KEY = "sk_..."
 *   node fetch_elevenlabs_llamadas.mjs
 *
 * Si no se pasan --from/--to, toma automaticamente la ULTIMA SEMANA COMPLETA
 * (lunes a domingo) anterior a hoy — el mismo criterio que usa la tarea
 * semanal del dashboard para Correo y Chat.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- argumentos ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const CONFIG_PATH = resolve(__dirname, args.config || "./elevenlabs_config.json");

// ---------- API key ----------
const XI_API_KEY = process.env.XI_API_KEY;
if (!XI_API_KEY) {
  console.error(
    "Falta la variable de entorno XI_API_KEY. Ejemplo (PowerShell): $env:XI_API_KEY = 'sk_...'"
  );
  process.exit(1);
}

// ---------- config ----------
let config;
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
} catch (e) {
  console.error(`No pude leer ${CONFIG_PATH}: ${e.message}`);
  process.exit(1);
}

const {
  api_base_url: API_BASE,
  agents: AGENTS,
  page_size: PAGE_SIZE = 100,
  include_cost_detail: INCLUDE_COST_DETAIL = false,
  cost_detail_delay_ms: COST_DELAY_MS = 250,
} = config.elevenlabs;

if (!AGENTS?.length) {
  console.error("elevenlabs_config.json no tiene agentes en elevenlabs.agents — nada que traer.");
  process.exit(1);
}

// ---------- semana a capturar ----------
function lastCompleteWeek(today = new Date()) {
  // Lunes de la semana actual (ISO, lunes = inicio)
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const day = d.getUTCDay(); // 0=domingo .. 6=sabado
  const diffToMonday = (day + 6) % 7;
  const thisMonday = new Date(d);
  thisMonday.setUTCDate(d.getUTCDate() - diffToMonday);
  // La semana completa anterior: lunes pasado a domingo pasado
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);
  return [fmt(lastMonday), fmt(lastSunday)];
}
function fmt(d) {
  return d.toISOString().slice(0, 10);
}

const [semanaInicio, semanaFin] = [
  args.from || lastCompleteWeek()[0],
  args.to || lastCompleteWeek()[1],
];

const afterUnix = Math.floor(new Date(`${semanaInicio}T00:00:00Z`).getTime() / 1000);
const beforeUnix = Math.floor(new Date(`${semanaFin}T23:59:59Z`).getTime() / 1000);

console.log(`Semana a capturar: ${semanaInicio} a ${semanaFin} (UTC unix ${afterUnix}-${beforeUnix})`);

// ---------- helpers HTTP ----------
async function elevenlabsFetch(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url, { headers: { "xi-api-key": XI_API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs API ${res.status} en ${url.pathname}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function listConversations(agentId) {
  const all = [];
  let cursor;
  do {
    const page = await elevenlabsFetch("/conversations", {
      agent_id: agentId,
      call_start_after_unix: afterUnix,
      call_start_before_unix: beforeUnix,
      page_size: PAGE_SIZE,
      cursor,
    });
    all.push(...(page.conversations || page.items || []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return all;
}

async function getConversationDetail(conversationId) {
  return elevenlabsFetch(`/conversations/${conversationId}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- agregación ----------
function aggregate(conversations, costDetails) {
  const n = conversations.length;
  const durSecs = conversations.map((c) => c.call_duration_secs ?? 0);
  const msgCounts = conversations.map((c) => c.message_count ?? 0);
  const exitosas = conversations.filter((c) => c.call_successful === "success").length;

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr) => (arr.length ? sum(arr) / arr.length : null);

  let costoTotal = null;
  let costoProm = null;
  let terminationCounts = null;
  if (costDetails) {
    const costos = costDetails.map((d) => d?.metadata?.cost_fiat).filter((v) => typeof v === "number");
    if (costos.length) {
      costoTotal = +sum(costos).toFixed(4);
      costoProm = +(sum(costos) / costos.length).toFixed(4);
    }
    terminationCounts = {};
    costDetails.forEach((d) => {
      const reason = d?.metadata?.termination_reason || d?.analysis?.termination_reason || "sin_dato";
      terminationCounts[reason] = (terminationCounts[reason] || 0) + 1;
    });
  }

  return {
    llamadas: n,
    duracion_prom_seg: avg(durSecs) !== null ? +avg(durSecs).toFixed(1) : null,
    mensajes_prom: avg(msgCounts) !== null ? +avg(msgCounts).toFixed(1) : null,
    pct_exitosas: n ? +((100 * exitosas) / n).toFixed(1) : null,
    costo_total_usd: costoTotal,
    costo_prom_usd: costoProm,
    motivo_cierre_tecnico: terminationCounts,
  };
}

// ---------- main ----------
async function main() {
  const porVersion = [];
  let todasLasConversaciones = [];

  for (const agent of AGENTS) {
    console.log(`Trayendo conversaciones de ${agent.nombre} (${agent.id})...`);
    const conversations = await listConversations(agent.id);
    console.log(`  -> ${conversations.length} llamadas encontradas`);

    let costDetails = null;
    if (INCLUDE_COST_DETAIL && conversations.length) {
      costDetails = [];
      for (const c of conversations) {
        try {
          const detail = await getConversationDetail(c.conversation_id);
          costDetails.push(detail);
        } catch (e) {
          console.warn(`  ! No pude traer detalle de ${c.conversation_id}: ${e.message}`);
        }
        await sleep(COST_DELAY_MS);
      }
    }

    const agg = aggregate(conversations, costDetails);
    porVersion.push({
      agent_id: agent.id,
      nombre: agent.nombre,
      version: agent.version,
      ...agg,
    });
    todasLasConversaciones = todasLasConversaciones.concat(conversations);
  }

  const totalLlamadas = porVersion.reduce((a, v) => a + v.llamadas, 0);
  const totalExitosas = todasLasConversaciones.filter((c) => c.call_successful === "success").length;
  const totalDuracion = todasLasConversaciones.reduce((a, c) => a + (c.call_duration_secs ?? 0), 0);

  const resultado = {
    fuente: "ElevenLabs Conversational AI API (/v1/convai/conversations)",
    generado: new Date().toISOString().slice(0, 10),
    semana_inicio: semanaInicio,
    semana_fin: semanaFin,
    incluye_costo_y_motivo_tecnico: Boolean(INCLUDE_COST_DETAIL),
    totales: {
      llamadas: totalLlamadas,
      duracion_prom_seg: totalLlamadas ? +(totalDuracion / totalLlamadas).toFixed(1) : null,
      pct_exitosas: totalLlamadas ? +((100 * totalExitosas) / totalLlamadas).toFixed(1) : null,
    },
    por_version: porVersion,
  };

  const outPath = resolve(__dirname, config.output?.snapshot_fragment_path || "./lucia_llamadas_elevenlabs.json");
  writeFileSync(outPath, JSON.stringify(resultado, null, 2), "utf-8");
  console.log(`Listo. Escrito en: ${outPath}`);
  console.log(JSON.stringify(resultado.totales, null, 2));
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
