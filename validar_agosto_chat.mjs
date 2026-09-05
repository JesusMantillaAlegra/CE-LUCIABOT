// Validación: reproducir por API (Conversations API real) el mes de Agosto 2026 de
// Chat que ya tenemos confirmado vía Breeze (demanda=7278, ingresados_bot=5792,
// gestionados=4249, escalados=1534 -- ver chat-month-2026-08 en lucia_dashboard_history.json).
//
// Paso A: encuentra los IDs de las 5 bandejas de Lucía por nombre.
// Paso B: cuenta hilos creados en agosto 2026 en esas bandejas (paginando desde los
//         más recientes, parando cuando ya salimos del mes -- agosto es el mes más
//         reciente así que no debería tardar muchas páginas).
// Paso C: saca el JSON crudo de 3 hilos de muestra para buscar la señal de "atendido
//         por bot" (todavía no sabemos en qué campo vive).
//
// Uso (misma sesión de PowerShell donde ya pusiste $env:HUBSPOT_TEST_TOKEN):
//   node validar_agosto_chat.mjs

const TOKEN = process.env.HUBSPOT_TEST_TOKEN;
if (!TOKEN) {
  console.error('Falta HUBSPOT_TEST_TOKEN en esta sesión de PowerShell.');
  process.exit(1);
}

const HEADERS = { Authorization: `Bearer ${TOKEN}` };
const BANDEJAS_LUCIA = ['COL-chat_sup', 'AC-chat_sup', 'Contador-chat_Sup', 'Nomina-chat_Sup', 'Nómina-chat_Sup', 'POS-chat_sup'];
const MES_DESDE = new Date('2026-08-01T00:00:00Z');
const MES_HASTA = new Date('2026-09-01T00:00:00Z');

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} en ${url}: ${body}`); // sin recortar, para ver la lista completa de valores válidos
  }
  return res.json();
}

// Candidatos de valor de 'sort' a probar en orden -- priorizamos los que probablemente
// den "más reciente primero" (para no tener que paginar años de historial viejo).
const SORT_CANDIDATOS = ['-id', '-createdAt', 'id:desc', 'createdAt:desc', 'id', 'createdAt', 'latestMessageTimestamp'];
let SORT_ELEGIDO = null;

async function elegirSortValido(inboxId) {
  if (SORT_ELEGIDO) return SORT_ELEGIDO;
  for (const candidato of SORT_CANDIDATOS) {
    try {
      const url = new URL('https://api.hubapi.com/conversations/v3/conversations/threads');
      url.searchParams.set('limit', '1');
      url.searchParams.set('inboxId', inboxId);
      url.searchParams.set('sort', candidato);
      await get(url.toString());
      SORT_ELEGIDO = candidato;
      console.log(`  (sort válido encontrado: "${candidato}")\n`);
      return candidato;
    } catch (e) {
      // este candidato no sirvió, prueba el siguiente
    }
  }
  console.log('  Ningún valor de sort probado funcionó -- se paginará sin ordenar (más lento).\n');
  SORT_ELEGIDO = '';
  return '';
}

async function encontrarBandejas() {
  console.log('Paso A: buscando IDs de las bandejas de Lucía...\n');
  const encontradas = [];
  let after;
  do {
    const url = new URL('https://api.hubapi.com/conversations/v3/conversations/inboxes');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const data = await get(url.toString());
    for (const inbox of data.results) {
      if (BANDEJAS_LUCIA.includes(inbox.name)) {
        encontradas.push(inbox);
        console.log(`  Encontrada: ${inbox.name} -> id ${inbox.id}`);
      }
    }
    after = data.paging?.next?.after;
  } while (after);
  console.log(`\nTotal bandejas de Lucía encontradas: ${encontradas.length} de ${BANDEJAS_LUCIA.length} esperadas.\n`);
  return encontradas;
}

async function contarHilosAgosto(inboxId, inboxName) {
  const sort = await elegirSortValido(inboxId);
  let after;
  let enRango = 0;
  let paginas = 0;
  let hilosMuestra = [];
  let seguir = true;
  let vistos = 0;
  let direccionDetectada = null; // 'desc' | 'asc' | null

  while (seguir) {
    const url = new URL('https://api.hubapi.com/conversations/v3/conversations/threads');
    url.searchParams.set('limit', '100');
    url.searchParams.set('inboxId', inboxId);
    if (sort) url.searchParams.set('sort', sort);
    if (after) url.searchParams.set('after', after);
    const data = await get(url.toString());
    paginas++;
    vistos += data.results.length;

    if (data.results.length >= 2 && !direccionDetectada) {
      const primero = new Date(data.results[0].createdAt);
      const ultimo = new Date(data.results[data.results.length - 1].createdAt);
      direccionDetectada = primero >= ultimo ? 'desc' : 'asc';
      if (direccionDetectada === 'asc') {
        console.log(`  (ADVERTENCIA: "${inboxName}" parece ordenado del más viejo al más nuevo -- puede tardar mucho en llegar a agosto 2026, hay límite de seguridad de 80 páginas)`);
      }
    }

    let masViejoDeLaPagina = null;
    for (const t of data.results) {
      const creado = new Date(t.createdAt);
      if (creado >= MES_DESDE && creado < MES_HASTA) {
        enRango++;
        if (hilosMuestra.length < 3) hilosMuestra.push(t);
      }
      if (!masViejoDeLaPagina || creado < masViejoDeLaPagina) masViejoDeLaPagina = creado;
    }

    after = data.paging?.next?.after;
    const salimosDelRangoPorAbajo = direccionDetectada === 'desc' && masViejoDeLaPagina && masViejoDeLaPagina < MES_DESDE;
    if (!after || salimosDelRangoPorAbajo || paginas > 80) seguir = false;
  }

  console.log(`  ${inboxName}: ${enRango} hilos creados en agosto 2026 (revisados ${vistos} hilos en ${paginas} páginas, sort="${sort || 'ninguno'}", orden detectado="${direccionDetectada || '?'}")`);
  return { inboxName, enRango, hilosMuestra };
}

async function main() {
  const bandejas = await encontrarBandejas();
  if (!bandejas.length) {
    console.log('No se encontró ninguna bandeja por nombre -- revisa BANDEJAS_LUCIA en el script.');
    return;
  }

  console.log('Paso B: contando hilos creados en agosto 2026 por bandeja...\n');
  let totalAgosto = 0;
  let muestraGlobal = [];
  for (const b of bandejas) {
    const r = await contarHilosAgosto(b.id, b.name);
    totalAgosto += r.enRango;
    muestraGlobal = muestraGlobal.concat(r.hilosMuestra);
  }

  console.log(`\n=== TOTAL hilos creados en agosto 2026 (las 5 bandejas de Lucía): ${totalAgosto} ===`);
  console.log('Comparar contra Demanda de Breeze para agosto 2026: 7278 (dato parcial, hasta el 28-ago).\n');

  console.log('Paso C: JSON crudo de hasta 3 hilos de muestra (buscar señal de bot aquí):\n');
  muestraGlobal.slice(0, 3).forEach((t, i) => {
    console.log(`--- Hilo de muestra ${i + 1} (id ${t.id}) ---`);
    console.log(JSON.stringify(t, null, 2));
    console.log('');
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
