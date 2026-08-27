// lib/elevenlabs.js
//
// Versión adaptada de fetch_elevenlabs_llamadas.mjs para correr dentro del serverless
// function semanal (en vez de a mano por consola). Misma lógica de agregación, misma
// fuente (elevenlabs_config.json), pero recibe el rango de semana ya calculado por el
// cron en vez de calcularlo de nuevo — así los tres bloques (Correo/Llamadas HubSpot/
// ElevenLabs) del mismo snapshot usan EXACTAMENTE la misma semana.

const API_BASE = "https://api.elevenlabs.io/v1/convai";

async function elevenlabsFetch(apiKey, path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs API ${res.status} en ${url.pathname}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function listConversations(apiKey, agentId, afterUnix, beforeUnix) {
  const all = [];
  let cursor;
  do {
    const page = await elevenlabsFetch(apiKey, "/conversations", {
      agent_id: agentId,
      call_start_after_unix: afterUnix,
      call_start_before_unix: beforeUnix,
      page_size: 100,
      cursor,
    });
    all.push(...(page.conversations || page.items || []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return all;
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function avg(arr) { return arr.length ? sum(arr) / arr.length : null; }

// config: el JSON de elevenlabs_config.json (agents, etc.) — se pasa ya parseado.
async function fetchElevenlabsLlamadas(config, semanaInicio, semanaFinExclusive) {
  const apiKey = process.env.XI_API_KEY;
  if (!apiKey) throw new Error("Falta la variable de entorno XI_API_KEY.");

  const afterUnix = Math.floor(new Date(`${semanaInicio}T00:00:00Z`).getTime() / 1000);
  // semanaFinExclusive es el lunes siguiente — restamos 1 segundo para que sea "hasta domingo 23:59:59"
  const beforeUnix = Math.floor(new Date(`${semanaFinExclusive}T00:00:00Z`).getTime() / 1000) - 1;

  const agents = config?.elevenlabs?.agents || [];
  if (!agents.length) throw new Error("elevenlabs_config.json no tiene agentes configurados.");

  const porVersion = [];
  let todas = [];
  for (const agent of agents) {
    const conversations = await listConversations(apiKey, agent.id, afterUnix, beforeUnix);
    const durSecs = conversations.map((c) => c.call_duration_secs ?? 0);
    const msgCounts = conversations.map((c) => c.message_count ?? 0);
    const exitosas = conversations.filter((c) => c.call_successful === "success").length;
    porVersion.push({
      agent_id: agent.id,
      nombre: agent.nombre,
      version: agent.version,
      llamadas: conversations.length,
      duracion_prom_seg: avg(durSecs) !== null ? +avg(durSecs).toFixed(1) : null,
      mensajes_prom: avg(msgCounts) !== null ? +avg(msgCounts).toFixed(1) : null,
      pct_completadas_sin_error_tecnico: conversations.length ? +((100 * exitosas) / conversations.length).toFixed(1) : null,
    });
    todas = todas.concat(conversations);
  }

  const totalLlamadas = porVersion.reduce((a, v) => a + v.llamadas, 0);
  const totalExitosas = todas.filter((c) => c.call_successful === "success").length;
  const totalDuracion = todas.reduce((a, c) => a + (c.call_duration_secs ?? 0), 0);

  return {
    fuente: "ElevenLabs Conversational AI API (/v1/convai/conversations)",
    nota: "pct_completadas_sin_error_tecnico mide si la llamada terminó su flujo técnico sin error (incluye llamadas que terminaron en escalamiento a humano) — NO es lo mismo que 'gestionadas', que mide si se resolvió SIN necesitar un humano (dato de negocio, de HubSpot). No mostrar las dos cifras una al lado de la otra como si fueran comparables.",
    cobertura_incompleta: agents.length < 3 ? "No incluye todos los bots de Llamadas — revisar elevenlabs_config.json." : null,
    totales: {
      llamadas: totalLlamadas,
      duracion_prom_seg: totalLlamadas ? +(totalDuracion / totalLlamadas).toFixed(1) : null,
      pct_completadas_sin_error_tecnico: totalLlamadas ? +((100 * totalExitosas) / totalLlamadas).toFixed(1) : null,
    },
    por_version: porVersion,
  };
}

export { fetchElevenlabsLlamadas };
