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
const COL_SUP_PIPELINE_ID = "1857341"; // Pipeline de soporte Colombia -- alcance real de Demanda/Gestionados/Escalados de Correo

function hsHeaders() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("Falta la variable de entorno HUBSPOT_TOKEN.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// HubSpot limita las requests por segundo (política "SECONDLY") — este job hace
// varias búsquedas paginadas seguidas y puede pasarse ese límite. Reintenta con
// espera cuando la API responde 429, en vez de fallar toda la corrida.
async function hsFetch(path, options = {}, attempt = 1) {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, { ...options, headers: { ...hsHeaders(), ...(options.headers || {}) } });
  if (res.status === 429 && attempt <= 5) {
    const retryAfterHeader = Number(res.headers.get("retry-after"));
    const waitMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : 500 * attempt;
    await sleep(waitMs);
    return hsFetch(path, options, attempt + 1);
  }
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
    if (after) await sleep(150); // deja algo de aire entre páginas para no pegarle al límite por segundo
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
// Definición REAL verificada (INSTRUCTIVO 1.10): owner = Lucía Pérez, Fuente = EMAIL.
// CORREGIDO 03-sep-2026: antes solo excluía la pipeline de ruido (NEQ 1860940), lo que
// dejaba pasar tickets de otros países/pipelines (Nómina, POS, Payments, etc.) que no son
// comparables con Demanda (que sí está fijada a Colombia/COL_Sup). Ahora exige el mismo
// pipeline de Colombia que usa Demanda -- validado con Breeze + consulta directa: jun 9,
// jul 99, ago 103 (antes: jun 9, jul 110, ago 122).
async function correoGestionadosCount(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "hubspot_owner_id", operator: "EQ", value: "89503870" },
    { propertyName: "source_type", operator: "EQ", value: "EMAIL" },
    { propertyName: "hs_pipeline", operator: "EQ", value: COL_SUP_PIPELINE_ID },
    ...dateRangeFilters("createdate", semanaInicio, semanaFinExclusive),
  ];
  return countTickets([{ filters }]);
}

// ---------- Correo: Escalados ----------
// Definición REAL verificada: escalamiento_lucia_email tiene un valor (HAS_PROPERTY).
// CORREGIDO 03-sep-2026: antes no tenía NINGÚN filtro de pipeline -- inflaba mucho el %
// de escalados de Colombia al incluir escalamientos de otros países. Validado: jun 5,
// jul 64, ago 52 (antes: jun 7, jul 130, ago 98 -- casi el doble en jul/ago).
async function correoEscaladosCount(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "escalamiento_lucia_email", operator: "HAS_PROPERTY" },
    { propertyName: "hs_pipeline", operator: "EQ", value: COL_SUP_PIPELINE_ID },
    ...dateRangeFilters("createdate", semanaInicio, semanaFinExclusive),
  ];
  return countTickets([{ filters }]);
}

// ---------- Correo: Demanda ----------
// Réplica por API del informe nativo "Demanda" (fuente=Correo, HD-Version=Colombia,
// Pipeline=COL_Sup, Bandeja=Service Mail Inbox). hd_version_ es la propiedad interna de
// "HD - Versión" en Tickets (confirmar el nombre exacto contra /crm/v3/properties/tickets
// antes de activar esto en producción -- se dejó el pipeline como filtro principal porque
// ya está 100% validado, y hd_version_ como filtro adicional a confirmar).
async function correoDemandaCount(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "source_type", operator: "EQ", value: "EMAIL" },
    { propertyName: "hs_pipeline", operator: "EQ", value: COL_SUP_PIPELINE_ID },
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

// ---------- Correo: Tiempo prom. de gestión (minutos) ----------
// Réplica de lo que antes salía solo vía HubSpot AI (Breeze): AVG(TIME_TO_CLOSE) sobre
// el mismo universo de Gestionados, en minutos. La Search API no tiene un AVG nativo por
// endpoint de conteo, así que se trae la propiedad y se promedia acá.
async function correoTiempoPromedioGestionMin(semanaInicio, semanaFinExclusive) {
  const filters = [
    { propertyName: "hubspot_owner_id", operator: "EQ", value: "89503870" },
    { propertyName: "source_type", operator: "EQ", value: "EMAIL" },
    { propertyName: "hs_pipeline", operator: "EQ", value: COL_SUP_PIPELINE_ID },
    { propertyName: "time_to_close", operator: "HAS_PROPERTY" },
    ...dateRangeFilters("createdate", semanaInicio, semanaFinExclusive),
  ];
  const tickets = await searchTicketsAll({ filterGroups: [{ filters }], properties: ["time_to_close"] });
  const valores = tickets.map((t) => Number(t.properties.time_to_close)).filter((v) => !Number.isNaN(v) && v > 0);
  if (!valores.length) return null;
  const avgMs = valores.reduce((a, v) => a + v, 0) / valores.length;
  return +(avgMs / 60000).toFixed(1); // ms -> min
}

// ---------- Chat: Conversations API real (NO Breeze, NO MCP) ----------
// Habilitada 03-sep-2026 (scope de Conversations concedido, ver REVSYS-573). IDs de
// bandeja confirmados en vivo contra /conversations/v3/conversations/inboxes.
const CHAT_INBOXES_LUCIA = {
  "COL-chat_sup": "2503145",
  "AC-chat_sup": "1434215125",
  "Contador-chat_Sup": "2560771",
  "Nómina-chat_Sup": "509730",
  "POS-chat_sup": "2267384",
};

// GET paginado sobre /conversations/v3/conversations/threads para UNA bandeja. Esta API
// no soporta rango de fecha como filtro de query -- hay que pedir páginas y filtrar por
// createdAt en el cliente, parando en cuanto la página sale del rango.
//
// CORREGIDO 05-sep-2026: antes SORT_THREADS se dejaba en `null` "hasta confirmarlo a mano"
// -- eso era el bug real detrás de que chatDemandaCount() devolviera 0 en la validación de
// agosto: sin sort, HubSpot puede devolver los hilos del más viejo al más más nuevo, y con
// el límite de seguridad de 80 páginas la función nunca llegaba a alcanzar agosto 2026 en
// bandejas con mucho historial. Ahora se auto-detecta un valor de `sort` válido la primera
// vez que se llama (mismo approach que se probó a mano en validar_agosto_chat.mjs), se
// cachea en SORT_THREADS_CACHE para no repetir la prueba en cada bandeja/corrida, y se usa
// la dirección real detectada (no asumida) para saber cuándo ya se pasó el rango buscado.
const SORT_CANDIDATOS_THREADS = ["-id", "-createdAt", "id:desc", "createdAt:desc", "id", "createdAt", "latestMessageTimestamp"];
let SORT_THREADS_CACHE = undefined; // undefined = sin probar todavía; "" = ninguno funcionó (paginar sin orden)

async function elegirSortThreadsValido(inboxIdDePrueba) {
  if (SORT_THREADS_CACHE !== undefined) return SORT_THREADS_CACHE;
  for (const candidato of SORT_CANDIDATOS_THREADS) {
    const url = new URL(`${HUBSPOT_BASE}/conversations/v3/conversations/threads`);
    url.searchParams.set("limit", "1");
    url.searchParams.set("inboxId", inboxIdDePrueba);
    url.searchParams.set("sort", candidato);
    const res = await fetch(url.toString(), { headers: hsHeaders() });
    if (res.ok) {
      SORT_THREADS_CACHE = candidato;
      return candidato;
    }
  }
  SORT_THREADS_CACHE = ""; // ningún candidato funcionó -- se pagina sin orden (más lento, con tope de seguridad)
  return "";
}

async function searchThreadsInRange(inboxId, semanaInicio, semanaFinExclusive) {
  const desde = new Date(`${semanaInicio}T00:00:00.000Z`);
  const hasta = new Date(`${semanaFinExclusive}T00:00:00.000Z`);
  const sort = await elegirSortThreadsValido(inboxId);
  let after;
  let enRango = [];
  let paginas = 0;
  let seguir = true;
  let direccionDetectada = null; // 'desc' | 'asc' | null -- se detecta con datos reales, no se asume

  while (seguir) {
    const url = new URL(`${HUBSPOT_BASE}/conversations/v3/conversations/threads`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("inboxId", inboxId);
    if (sort) url.searchParams.set("sort", sort);
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url.toString(), { headers: hsHeaders() });
    if (!res.ok) throw new Error(`HubSpot Conversations API ${res.status} en threads: ${(await res.text()).slice(0, 300)}`);
    const page = await res.json();
    paginas++;

    if (page.results?.length >= 2 && !direccionDetectada) {
      const primero = new Date(page.results[0].createdAt);
      const ultimo = new Date(page.results[page.results.length - 1].createdAt);
      direccionDetectada = primero >= ultimo ? "desc" : "asc";
    }

    let masViejoDeLaPagina = null;
    for (const t of page.results || []) {
      const creado = new Date(t.createdAt);
      if (creado >= desde && creado < hasta) enRango.push(t);
      if (!masViejoDeLaPagina || creado < masViejoDeLaPagina) masViejoDeLaPagina = creado;
    }

    after = page.paging?.next?.after;
    // Solo se puede cortar temprano si sabemos que el orden es descendente (más nuevo
    // primero) -- si es ascendente o desconocido, hay que seguir paginando hasta el tope
    // de seguridad, porque el rango buscado podría estar más adelante.
    const salimosPorAbajo = direccionDetectada === "desc" && masViejoDeLaPagina && masViejoDeLaPagina < desde;
    if (!after || salimosPorAbajo || paginas > 80) seguir = false;
    if (after) await sleep(150);
  }
  return enRango;
}

// ---------- Chat: Demanda ----------
// Todas las conversaciones creadas en el período en las 5 bandejas de Lucía. Sin filtro
// de Flujo (para no ser circular con Ingresados -- ver METRICAS_TABLERO_LUCIA.md).
async function chatDemandaCount(semanaInicio, semanaFinExclusive) {
  let total = 0;
  for (const inboxId of Object.values(CHAT_INBOXES_LUCIA)) {
    const hilos = await searchThreadsInRange(inboxId, semanaInicio, semanaFinExclusive);
    total += hilos.length;
    await sleep(150);
  }
  return total;
}

// ---------- Chat: Ingresados / Gestionados / Escalados -- BLOQUEADO ----------
// NO IMPLEMENTAR A CIEGAS. Todavía no sabemos en qué propiedad de la Conversations API
// vive la señal de "atendido por bot" (candidatos vistos en la auditoría de Breeze:
// hs_conversation_session_is_bot, hs_has_first_assigned_bot_id -- pero esos son nombres
// de propiedades de reporting interno, no confirmados como devueltos por este endpoint
// público). Corre validar_agosto_chat.mjs, inspecciona el JSON crudo de un hilo, y recién
// ahí se implementa esta función con el campo real -- de lo contrario el dashboard
// mostraría un número inventado sin validar, que es peor que seguir pidiéndoselo a Breeze.
async function chatIngresadosGestionadosEscalados() {
  throw new Error(
    "chatIngresadosGestionadosEscalados() no está implementada todavía: falta confirmar en qué " +
      "propiedad de /conversations/v3/conversations/threads (o del detalle de mensajes de un hilo) " +
      "vive la señal de bot. Ver validar_agosto_chat.mjs y METRICAS_TABLERO_LUCIA.md."
  );
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
    if (after) await sleep(150);
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
    // quita tildes antes de comparar contra el diccionario: el regex de arriba preserva
    // acentos (á é í ó ú ñ), así que "petición" no coincidía con la clave sin tilde
    // "peticion" y todo lo que decía "Petición del usuario" caía silenciosamente en "Otro".
    // Bug real encontrado 03-sep-2026 comparando el resultado de la API en vivo (agosto)
    // contra el snapshot guardado: la API mostraba "Otro" ~2008 y 0 en "Petición del
    // usuario", mientras el snapshot (calculado antes de este bug, con otro método) sí
    // traía "Petición del usuario": 1901 — el volumen coincide, solo cambiaba la etiqueta.
    const motivoSinTildes = motivo
      ? motivo.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      : null;
    const motivoLabel =
      {
        "peticion del usuario": "Petición del usuario",
        "desconocimiento": "Desconocimiento",
        "falta de acceso": "Falta de acceso",
        "error de cobro": "Error de cobro",
      }[motivoSinTildes] || "Otro";
    // rawMotivo se devuelve solo para diagnóstico (loguear qué texto exacto cayó en
    // "Otro" y así poder agregarlo al diccionario de arriba) — no se guarda en el snapshot.
    return { bucket: "escaladas", motivo: motivoLabel, rawMotivo: motivoLabel === "Otro" ? motivo || raw : null };
  }
  if (v === "no respuesta" || v === "se cuelga la llamada" || v === "usuario colgo" || v === "usuario colgó") {
    return { bucket: "no_contestadas" };
  }
  return { bucket: "sin_clasificar" };
}

async function llamadasPorVersion(semanaInicio, semanaFinExclusive) {
  const porVersion = [];
  const motivoEscalamiento = new Map();
  const otrosRawDebug = new Map(); // texto crudo -> count, solo para diagnóstico de "Otro"

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
      const { bucket, motivo, rawMotivo } = bucketEstadoLlamada(c.properties.estado_llamada);
      buckets[bucket] = (buckets[bucket] || 0) + 1;
      if (bucket === "escaladas" && motivo) motivoEscalamiento.set(motivo, (motivoEscalamiento.get(motivo) || 0) + 1);
      if (rawMotivo) otrosRawDebug.set(rawMotivo, (otrosRawDebug.get(rawMotivo) || 0) + 1);
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
    await sleep(200); // pausa corta entre bots, después de Correo ya se gastó parte del cupo por segundo
  }

  const motivo_escalamiento = Array.from(motivoEscalamiento.entries())
    .map(([motivo, count]) => ({ motivo, count }))
    .sort((a, b) => b.count - a.count);

  const otros_raw_debug = Array.from(otrosRawDebug.entries())
    .map(([texto, count]) => ({ texto, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { porVersion, motivo_escalamiento, otros_raw_debug };
}

export {
  NOISE_PIPELINE_ID,
  COL_SUP_PIPELINE_ID,
  correoGestionadosCount,
  correoEscaladosCount,
  correoDemandaCount,
  correoTiempoPromedioGestionMin,
  correoPorStage,
  correoCsatSemana,
  resolvePipelineStageLabels,
  llamadasPorVersion,
  bucketEstadoLlamada,
  CHAT_INBOXES_LUCIA,
  chatDemandaCount,
  chatIngresadosGestionadosEscalados,
};
