// Diagnóstico CSAT Llamadas -- distribución real (22-sep-2026)
//
// El dashboard ya muestra CSAT en vivo (5.1/10 sobre 150 encuestas en septiembre), pero
// Jesús preguntó si en vez de un promedio /10 se puede mostrar como % positivo, igual que
// Correo/Chat (que muestran % Promoter). Para decidir el corte de "positivo" (¿score >= 8?
// >= 7?) hace falta ver la distribución REAL de los scores -- no inventar un corte a ciegas.
//
// Este script no usa llamadasCsat() (que ya resume a un promedio) sino que llama
// fetchBehavioralEventsAll directo... como esa función no está exportada, este script
// duplica la llamada mínima a la API de eventos para poder imprimir el histograma crudo.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node diagnosticar_csat_llamadas_distribucion.mjs

const HUBSPOT_BASE = "https://api.hubapi.com";
const EVENT_TYPE = "pe6180490_customer_survey_score";
const AGENTE = "lucia-ivr";

function sinTildes(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function fetchAll(occurredAfterISO, occurredBeforeISO) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("Falta $env:HUBSPOT_TOKEN en esta sesión de PowerShell.");
  const all = [];
  let after;
  do {
    const params = new URLSearchParams({ eventType: EVENT_TYPE, occurredAfter: occurredAfterISO, occurredBefore: occurredBeforeISO, limit: "100" });
    if (after) params.set("after", after);
    const res = await fetch(`${HUBSPOT_BASE}/events/v3/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const page = await res.json();
    all.push(...(page.results || []));
    after = page.paging?.next?.after;
  } while (after);
  return all;
}

// Rango amplio: desde que arrancó Llamadas hasta hoy.
const DESDE = "2026-07-01T00:00:00.000Z";
const HASTA = "2026-09-23T00:00:00.000Z"; // ajustar si se corre otro día

console.log(`Trayendo TODOS los eventos ${EVENT_TYPE} entre ${DESDE} y ${HASTA}...`);
const eventos = await fetchAll(DESDE, HASTA);
console.log(`Total eventos (todos los agentes): ${eventos.length}`);

const deLucia = eventos.filter((ev) => sinTildes(ev.properties?.agent) === AGENTE);
console.log(`Eventos con agent=Lucía-IVR: ${deLucia.length}`);

const hist = new Map();
deLucia.forEach((ev) => {
  const raw = ev.properties?.surveyscore;
  hist.set(raw, (hist.get(raw) || 0) + 1);
});

const filas = Array.from(hist.entries()).sort((a, b) => {
  const na = Number(a[0]), nb = Number(b[0]);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a[0]).localeCompare(String(b[0]));
});

console.log("\nDistribución real de 'surveyscore' (valor -> cantidad):");
filas.forEach(([valor, count]) => console.log(`  ${String(valor).padStart(6)} -> ${count}`));

// Candidatos de corte "positivo" dentro de 1-10 (excluye valores fuera de rango, igual
// criterio que llamadasCsat() en lib/hubspot.js).
const validos = deLucia.map((ev) => Number(ev.properties?.surveyscore)).filter((v) => !Number.isNaN(v) && v >= 1 && v <= 10);
console.log(`\nValores válidos (1-10): ${validos.length} de ${deLucia.length} (${deLucia.length - validos.length} descartados por estar fuera de rango)`);

[6, 7, 8, 9].forEach((corte) => {
  const positivos = validos.filter((v) => v >= corte).length;
  const pct = validos.length ? ((100 * positivos) / validos.length).toFixed(2) : "—";
  console.log(`  % con score >= ${corte}: ${pct}% (${positivos}/${validos.length})`);
});

const promedio = validos.length ? (validos.reduce((a, v) => a + v, 0) / validos.length).toFixed(2) : "—";
console.log(`\nPromedio simple (1-10): ${promedio}`);
