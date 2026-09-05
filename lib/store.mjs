// lib/store.mjs
//
// Guarda y lee el histórico de snapshots de Lucía. Vercel no tiene disco
// persistente (cada invocación arranca en limpio), así que el histórico vive
// en el MISMO Redis (Vercel KV / Upstash) que ya usa el dashboard de
// CE-Retention -- no hace falta una base nueva, ya está conectada también a
// este proyecto (Storage → Connect Project). Para no pisar los datos de
// Retention en el mismo Redis, todas las claves de acá van bajo el prefijo
// "lucia:" en vez de "ce-retention:".
//
// Por qué KV y no Postgres: el patrón de uso es "leer todo, agregar uno", un
// snapshot por SEMANA (no por día, a diferencia de Retention), pocos KB cada
// uno. No hace falta SQL ni esquema. (Mismo razonamiento que
// ce-retention-soporte-ops/lib/store.mjs, copiado de ahí y adaptado a la
// forma real de un snapshot de Lucía: identificado por `semana_inicio`, no
// por un `snapshot_id` de un solo día.)

const PREFIJO = 'lucia:';
const KEY_HISTORICO = `${PREFIJO}history`;
const PREFIJO_CUBO = `${PREFIJO}cubo:`;

// Los nombres de las variables dependen del proveedor de Redis que se conecte
// desde el Marketplace de Vercel: la integración clásica de Vercel KV inyecta
// KV_REST_API_*, mientras que conectar Upstash directamente inyecta
// UPSTASH_REDIS_REST_*. Ambas exponen la misma API REST (/get/clave y
// /set/clave), así que se acepta cualquiera de las dos y el resto del código
// no se entera de la diferencia.
function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'No hay store de Redis conectado. Faltan KV_REST_API_URL / KV_REST_API_TOKEN ' +
      '(o UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) en las variables de entorno ' +
      'de este proyecto. Re-desplegar después de conectar la base para que entren.'
    );
  }
  return { url: url.replace(/\/+$/, ''), token };
}

async function kvFetch(path, init = {}) {
  const { url, token } = kvConfig();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Vercel KV ${path} falló (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

// Devuelve el array de snapshots (cada uno con la MISMA forma que ya tenían
// en lucia_dashboard_history.json: id, semana_inicio, semana_fin, correo,
// chat, llamadas, etc.), ordenado de más antiguo a más reciente.
export async function leerHistorico() {
  const out = await kvFetch(`/get/${encodeURIComponent(KEY_HISTORICO)}`);
  if (!out?.result) return [];
  try {
    // KV devuelve el valor como string; puede venir doblemente serializado
    // según cómo se haya escrito, así que se maneja ambos casos.
    const parsed = typeof out.result === 'string' ? JSON.parse(out.result) : out.result;
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.slice().sort((a, b) => String(a.semana_inicio).localeCompare(String(b.semana_inicio)));
  } catch {
    return [];
  }
}

async function escribirHistorico(historico) {
  await kvFetch(`/set/${encodeURIComponent(KEY_HISTORICO)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(historico),
  });
}

// Agrega un snapshot al histórico, identificándolo por `semana_inicio` (así
// funcionaba la idempotencia en el cron viejo contra GitHub). Si ya existe un
// snapshot para esa semana lo REEMPLAZA solo si se pasa `force: true` --
// igual comportamiento que antes (?force=true / X-Force-Reprocess).
export async function guardarSnapshot(snapshot, { force = false } = {}) {
  if (!snapshot?.semana_inicio) {
    throw new Error('guardarSnapshot: el snapshot necesita un campo semana_inicio.');
  }
  const historico = await leerHistorico();
  const i = historico.findIndex((s) => s.semana_inicio === snapshot.semana_inicio);

  if (i >= 0 && !force) {
    return { total: historico.length, agregado: false, motivo: 'ya_existe' };
  }

  if (i >= 0) historico[i] = snapshot;
  else historico.push(snapshot);

  historico.sort((a, b) => String(a.semana_inicio).localeCompare(String(b.semana_inicio)));
  await escribirHistorico(historico);

  return { total: historico.length, agregado: true, reemplazado: i >= 0 };
}

// Reemplaza el histórico completo. Se usa una sola vez para sembrar (seed)
// los snapshots que ya existían en lucia_dashboard_history.json antes de
// migrar a KV -- ver api/seed.js. También sirve para revertir un force
// erróneo si hiciera falta.
export async function reemplazarHistorico(historico) {
  if (!Array.isArray(historico)) throw new Error('reemplazarHistorico: se esperaba un array de snapshots.');
  await escribirHistorico(historico);
  return { total: historico.length };
}

// ── Cubos mensuales (mismo patrón que ce-retention-soporte-ops/lib/cubos.mjs)
// -- un cubo por mes calendario, guardado bajo su propia clave en vez de un
// solo array grande: así leer/escribir un mes no toca los demás. Pensado para
// las piezas caras de Correo (owner-history, mediana con corrección de
// censura) una vez se reconstruyan como funciones en vivo -- no se usa
// todavía, se deja lista para esa siguiente etapa.
export async function obtenerCubo(mesId) {
  try {
    const out = await kvFetch(`/get/${encodeURIComponent(PREFIJO_CUBO + mesId)}`);
    if (!out?.result) return null;
    return typeof out.result === 'string' ? JSON.parse(out.result) : out.result;
  } catch {
    // KV no conectado o clave corrupta: se trata como "no hay cubo todavía"
    // -- nunca tumba el tablero, quien llame decide si recalcula en vivo.
    return null;
  }
}

export async function guardarCubo(mesId, data) {
  await kvFetch(`/set/${encodeURIComponent(PREFIJO_CUBO + mesId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
