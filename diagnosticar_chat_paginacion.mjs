// Diagnóstico: el sort ascendente por "id" funciona, pero paginar desde el hilo más viejo
// hasta agosto 2026 tomaría miles de páginas (bandejas con años de historial). Este script
// prueba si se puede "saltar" directo cerca de agosto usando el cursor `after` con un valor
// que nosotros mismos calculamos (búsqueda binaria), en vez de paginar secuencialmente.
//
// Paso A: confirma si el cursor `after` que devuelve la API es literalmente el id del
//         último hilo de la página (si es así, podemos construir nuestro propio `after`
//         sin tener que pedir todas las páginas intermedias).
// Paso B: si el Paso A confirma que sí, hace una búsqueda binaria sobre el id para
//         encontrar el punto donde createdAt cruza el 1-ago-2026, usando SOLO la bandeja
//         COL-chat_sup como referencia (los ids son globales al portal, no por bandeja,
//         así que el mismo id aproximado debería servir de punto de partida para las
//         otras 4 bandejas también).
// Paso C: también muestra el texto de error completo de los sorts descendentes que
//         fallaron (-id, -createdAt, id:desc, createdAt:desc) para descartar que sea un
//         problema de sintaxis fácil de arreglar.
//
// Uso (misma sesión de PowerShell donde ya pusiste $env:HUBSPOT_TEST_TOKEN):
//   node diagnosticar_chat_paginacion.mjs

const TOKEN = process.env.HUBSPOT_TEST_TOKEN || process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Falta HUBSPOT_TEST_TOKEN (o HUBSPOT_TOKEN) en esta sesión de PowerShell.');
  process.exit(1);
}
const HEADERS = { Authorization: `Bearer ${TOKEN}` };
const INBOX_REFERENCIA = '2503145'; // COL-chat_sup
const OBJETIVO = new Date('2026-08-01T00:00:00Z');

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

async function main() {
  console.log('=== Paso C: por qué fallan los sorts descendentes ===\n');
  for (const candidato of ['-id', '-createdAt', 'id:desc', 'createdAt:desc']) {
    const url = new URL('https://api.hubapi.com/conversations/v3/conversations/threads');
    url.searchParams.set('limit', '1');
    url.searchParams.set('inboxId', INBOX_REFERENCIA);
    url.searchParams.set('sort', candidato);
    const r = await get(url.toString());
    console.log(`  sort="${candidato}" -> HTTP ${r.status}: ${r.text.slice(0, 250)}`);
  }

  console.log('\n=== Paso A: ¿el cursor "after" es literalmente el id del último hilo? ===\n');
  const urlPrimeraPagina = new URL('https://api.hubapi.com/conversations/v3/conversations/threads');
  urlPrimeraPagina.searchParams.set('limit', '5');
  urlPrimeraPagina.searchParams.set('inboxId', INBOX_REFERENCIA);
  urlPrimeraPagina.searchParams.set('sort', 'id');
  const primera = await get(urlPrimeraPagina.toString());
  if (!primera.ok) {
    console.log(`  Error trayendo la primera página: HTTP ${primera.status}: ${primera.text.slice(0, 300)}`);
    return;
  }
  const resultados = primera.json.results || [];
  const ultimoId = resultados[resultados.length - 1]?.id;
  const afterDevuelto = primera.json.paging?.next?.after;
  console.log(`  Último id de la página: ${ultimoId}`);
  console.log(`  "after" que devuelve la API: ${afterDevuelto}`);
  const esLiteral = String(ultimoId) === String(afterDevuelto);
  console.log(`  ¿Son iguales? ${esLiteral ? 'SÍ -- el cursor es literal, podemos construir nuestro propio "after"' : 'NO -- el cursor es opaco, no podemos inventarlo'}\n`);

  const oldestId = Number(resultados[0]?.id);
  const oldestCreatedAt = resultados[0]?.createdAt;
  console.log(`  Id más viejo visto: ${oldestId} (creado ${oldestCreatedAt})`);

  if (!esLiteral || !Number.isFinite(oldestId)) {
    console.log('\nNo se puede hacer la búsqueda binaria (cursor opaco o id no numérico). Hay que pensar otra estrategia -- avísame con esta salida completa.');
    return;
  }

  console.log('\n=== Paso B: búsqueda binaria para encontrar el id donde createdAt cruza el 1-ago-2026 ===\n');
  // Cota superior: duplicar hasta encontrar un id cuyo hilo (o el más cercano por debajo)
  // ya sea posterior al objetivo, o hasta quedarnos sin resultados (fin del historial).
  let low = oldestId;
  let high = oldestId + 1000;
  let iteraciones = 0;
  async function fechaEnId(after) {
    const url = new URL('https://api.hubapi.com/conversations/v3/conversations/threads');
    url.searchParams.set('limit', '1');
    url.searchParams.set('inboxId', INBOX_REFERENCIA);
    url.searchParams.set('sort', 'id');
    url.searchParams.set('after', String(after));
    const r = await get(url.toString());
    if (!r.ok) return { ok: false, status: r.status };
    const item = (r.json.results || [])[0];
    return { ok: true, createdAt: item ? new Date(item.createdAt) : null, id: item?.id };
  }

  // expandir "high" hasta pasarnos del objetivo o quedarnos sin datos
  while (iteraciones < 40) {
    iteraciones++;
    const r = await fechaEnId(high);
    if (!r.ok || !r.createdAt) { console.log(`  high=${high}: sin resultados (fin del historial) -- paro de expandir aquí`); break; }
    console.log(`  high=${high}: createdAt=${r.createdAt.toISOString()}`);
    if (r.createdAt >= OBJETIVO) break;
    low = high;
    high = high * 2;
  }

  // búsqueda binaria entre low y high
  for (let i = 0; i < 40 && high - low > 50; i++) {
    const mid = Math.floor((low + high) / 2);
    const r = await fechaEnId(mid);
    if (!r.ok || !r.createdAt) { high = mid; continue; }
    console.log(`  mid=${mid}: createdAt=${r.createdAt.toISOString()}`);
    if (r.createdAt < OBJETIVO) low = mid; else high = mid;
  }

  console.log(`\nId aproximado justo antes de agosto 2026: ~${low}`);
  console.log('Con este id se puede armar "after" para saltar directo cerca de agosto en cualquier bandeja,');
  console.log('en vez de paginar desde el principio del historial. Pégame toda esta salida.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
