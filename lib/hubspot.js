// lib/hubspot.js
//
// Helpers para llamar directamente la API REST de HubSpot (NO el conector MCP —
// esto corre en un serverless function de Vercel, sin acceso a ese conector).
// Requiere un HubSpot Private App token en la variable de entorno HUBSPOT_TOKEN,
// con scope de lectura de "Tickets" y "Calls" como mínimo (crm.objects.tickets.read,
// crm.objects.calls.read). Ver INSTRUCTIVO.md sección 1.13 para cómo crear el token.
//
// Todas las definiciones de filtros usadas aquí vienen de la investigación
// documentada en INSTRUCTIVO.md secciones 1.10 (Correo) y 1.6 (CSAT) y 7 (Llamadas) —
// verificadas contra HubSpot en vivo el 25-ago-2026. NO cambiar estos filtros sin
// volver a verificar contra el panel de HubSpot primero.

const HUBSPOT_BASE = "https://api.hubapi.com";
const NOISE_PIPELINE_ID = "1860940"; // "Correos que no requieren respuesta" — ruido, no es soporte real

function hsHeaders() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("Falta la variable de entorno HUBSPOT_TOKEN.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function hsFetch(path, options = {}) {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, { ...options, headers: { ...hsHeaders(), ...(options.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HubSpot API ${res.status} en ${path}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// ---------- TICKET search (paginado, trae todas las filas que hagan falta) ----------
async function searchTicketsAll({ filterGroups, properties = [], sorts }) {
  const all = [];
  let after;
  do {
    const body = { filterGroups, properties, limit: 100, sorts };
    if (after) body.after = after;
    const page = await hsFetch("/crm/v3/objects/tickets/search", { method: "POST", body: JSON.stringify(body) });
    all.push(...(page.results || []));
    after = page.paging?.next?.after;
  } while (after);
  return all;
}

// Solo el total (rápido, un solo request, limit=1 — usa page.total)
async function countTickets(filterGroups) {
  const page = await hsFetch("/crm/v3/objects/tickets/search", {
    method: "POST",
    body: JSON.stringify({ filterGroups, properties: [], limit: 1 }),
  });
  return page.total || 0;
}

function dateRangeFilters(propName, fromISO, toISOExclusive) {
  // createdate en HubSpot Search API se compara en epoch millis (string)
  const fromMs = String(Date.parse(`${fromISO}T00:00:00.000Z`));
  const toMs = String(Date.parse(`${toISOExclusive}T00:00:00.000Z`)); // exclusivo (lunes siguiente)
  return [
    { propertyName: propName, operator: "GTE", value: fromMs },
    { propertyName: propName, operator: "LT", value: toMs },
  ];
}

// ---------- Correo: Gestionados ----------
// Definición REAL verificada (INSTRUCTIVO 1.10): owner = Lucía Pérez, Fuente = EMAIL,
// excluyendo la pipeline de ruido "Correos que no requieren respuesta".
async function correoGestionadosCount(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "hubspot_owner_id", operator: "EQ", value: "89503870" },
    { propertyName: "source_type", operator: "EQ", value: "EMAIL" },
    { propertyName: "hs_pipeline", operator: "NEQ", value: NOISE_PIPELINE_ID },
    ...dateRangeFilters("createdate", semanaInicio, semanaFinExclusive),
  ];
  return countTickets([{ filters }]);
}

// ---------- Correo: Escalados ----------
// Definición REAL verificada: escalamiento_lucia_email tiene un valor (HAS_PROPERTY),
// excluyendo la misma pipeline de ruido.
async function correoEscaladosCount(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "escalamiento_lucia_email", operator: "HAS_PROPERTY" },
    { propertyName: "hs_pipeline", operator: "NEQ", value: NOISE_PIPELINE_ID },
    ...dateRangeFilters("createdate", semanaInicio, semanaFinExclusive),
  ];
  return countTickets([{ filters }]);
}

// ---------- Correo: por_stage (mismos tickets de "Gestionados", agrupados por stage) ----------
async function correoPorStage(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "hubspot_owner_id", operator: "EQ", value: "89503870" },
    { propertyName: "source_type", operator: "EQ", value: "EMAIL" },
    { propertyName: "hs_pipeline", operator: "NEQ", value: NOISE_PIPELINE_ID },
    ...dateRangeFilters("createdate", semanaInicio, semanaFinExclusive),
  ];
  const tickets = await searchTicketsAll({
    filterGroups: [{ filters }],
    properties: ["hs_pipeline", "hs_pipeline_stage"],
  });
  const counts = new Map(); // "pipelineId:stageId" -> count
  tickets.forEach((t) => {
    const key = `${t.properties.hs_pipeline}:${t.properties.hs_pipeline_stage}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts; // se etiqueta después con resolvePipelineStageLabels()
}

// ---------- Correo: CSAT semanal (Promoter/Passive/Detractor) ----------
// Scope documentado (INSTRUCTIVO 1.6): pipelines de Correo en general (Fuente=EMAIL),
// SIN filtro de owner (no se puede aislar "solo lo que gestionó el bot" de forma confiable).
async function correoCsatSemana(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "source_type", operator: "EQ", value: "EMAIL" },
    { propertyName: "hs_pipeline", operator: "NEQ", value: NOISE_PIPELINE_ID },
    { propertyName: "clasificacion_encuesta_ces_csat", operator: "HAS_PROPERTY" },
    ...dateRangeFilters("createdate", semanaInicio, semanaFinExclusive),
  ];
  const tickets = await searchTicketsAll({
    filterGroups: [{ filters }],
    properties: ["clasificacion_encuesta_ces_csat"],
  });
  const out = { promoter: 0, passive: 0, detractor: 0 };
  tickets.forEach((t) => {
    const v = (t.properties.clasificacion_encuesta_ces_csat || "").trim();
    if (v === "Promoter") out.promoter++;
    else if (v === "Passive") out.passive++;
    else if (v === "Detractor") out.detractor++;
  });
  return out;
}

// ---------- Pipelines API: para traer labels reales de pipeline/stage ----------
// La Search API solo devuelve IDs numéricos para hs_pipeline/hs_pipeline_stage — hay
// que resolverlos contra /crm/v3/pipelines/tickets para armar "Closed (COL_Sup)".
async function fetchTicketPipelineLabels() {
  const data = await hsFetch("/crm/v3/pipelines/tickets");
  const map = new Map(); // "pipelineId:stageId" -> "Stage (PipelineLabel)"
  (data.results || []).forEach((pipeline) => {
    (pipeline.stages || []).forEach((stage) => {
      map.set(`${pipeline.id}:${stage.id}`, `${stage.label} (${pipeline.label})`);
    });
  });
  return map;
}

async function resolvePipelineStageLabels(counts) {
  const labels = await fetchTicketPipelineLabels();
  return Array.from(counts.entries())
    .map(([key, count]) => ({ stage: labels.get(key) || key, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------- Llamadas: CALL search ----------
const BOT_CALIFICADOR_VERSIONES = [
  { bot_calificador: "lucia-ivr", version: "COL" },
  { bot_calificador: "lucia-ivr-dom", version: "DOM" },
  { bot_calificador: "lucia ivr fuerahorario", version: "Fuera de horario" },
];

async function searchCallsAll({ filterGroups, properties = [] }) {
  const all = [];
  let after;
  do {
    const body = { filterGroups, properties, limit: 100 };
    if (after) body.after = after;
    const page = await hsFetch("/crm/v3/objects/calls/search", { method: "POST", body: JSON.stringify(body) });
    all.push(...(page.results || []));
    after = page.paging?.next?.after;
  } while (after);
  return all;
}

// Normaliza y bucketiza estado_llamada según la definición documentada en
// INSTRUCTIVO.md sección 7 (validada 25-ago-2026 contra los valores reales de HubSpot).
// Cualquier valor no reconocido cae en "sin_clasificar" — nunca se descarta silenciosamente.
function bucketEstadoLlamada(raw) {
  const v = (raw || "").trim().toLowerCase();
  if (v.startsWith("soporte correcto") || v === "seporte correcto") {
    return { bucket: "gestionadas" };
  }
  const esc = v.match(/^(?:escalamiento(?: necesario)? por|transferencia por)\s+([a-z\sáéíóúñ]+?)(?::|$)/);
  if (esc || v === "escalation to human support") {
    let motivo = esc ? esc[1].trim() : null; // "escalation to human support" no trae motivo — cae en "Otro"
    // normaliza el typo conocido "usaurio" -> "usuario"
    if (motivo) motivo = motivo.replace("usaurio", "usuario");
    const motivoLabel =
      {
        "peticion del usuario": "Petición del usuario",
        "desconocimiento": "Desconocimiento",
        "falta de acceso": "Falta de acceso",
        "error de cobro": "Error de cobro",
      }[motivo] || "Otro";
    return { bucket: "escaladas", motivo: motivoLabel };
  }
  if (v === "no respuesta" || v === "se cuelga la llamada" || v === "usuario colgo" || v === "usuario colgó") {
    return { bucket: "no_contestadas" };
  }
  return { bucket: "sin_clasificar" };
}

async function llamadasPorVersion(semanaInicio, semanaFinExclusive) {
  const porVersion = [];
  const motivoEscalamiento = new Map();

  for (const { bot_calificador, version } of BOT_CALIFICADOR_VERSIONES) {
    const filters = [
      { propertyName: "bot_calificador", operator: "EQ", value: bot_calificador },
      ...dateRangeFilters("hs_createdate", semanaInicio, semanaFinExclusive),
    ];
    const calls = await searchCallsAll({
      filterGroups: [{ filters }],
      properties: ["estado_llamada", "hs_call_duration"],
    });

    const buckets = { demanda: calls.length, gestionadas: 0, escaladas: 0, no_contestadas: 0, sin_clasificar: 0 };
    let durSumMs = 0, durCount = 0;
    calls.forEach((c) => {
      const { bucket, motivo } = bucketEstadoLlamada(c.properties.estado_llamada);
      buckets[bucket] = (buckets[bucket] || 0) + 1;
      if (bucket === "escaladas" && motivo) motivoEscalamiento.set(motivo, (motivoEscalamiento.get(motivo) || 0) + 1);
      const dur = Number(c.properties.hs_call_duration);
      if (!Number.isNaN(dur) && dur > 0) { durSumMs += dur; durCount++; }
    });

    porVersion.push({
      version,
      bot_calificador,
      demanda: buckets.demanda,
      gestionadas: buckets.gestionadas,
      escaladas: buckets.escaladas,
      no_contestadas: buckets.no_contestadas,
      sin_clasificar: buckets.sin_clasificar,
      pct_gestion: buckets.demanda ? +((100 * buckets.gestionadas) / buckets.demanda).toFixed(1) : 0,
      duracion_prom_seg: durCount ? +(durSumMs / durCount / 1000).toFixed(1) : null,
    });
  }

  const motivo_escalamiento = Array.from(motivoEscalamiento.entries())
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count);

  return { porVersion, motivo_escalamiento };
}

export {
  NOISE_PIPELINE_ID,
  correoGestionadosCount,
  correoEscaladosCount,
  correoPorStage,
  correoCsatSemana,
  resolvePipelineStageLabels,
  llamadasPorVersion,
  bucketEstadoLlamada,
};
