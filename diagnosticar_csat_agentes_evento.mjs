// Diagnóstico CSAT -- ¿qué valores de "agent" existen en el evento de comportamiento
// "Encuesta de satisfacción CS" (pe6180490_customer_survey_score)? (22-sep-2026)
//
// Ya sabemos que "Lucía-IVR" es el agente usado para Llamadas. La pregunta ahora es:
// ¿existe un agente equivalente para Chat (algo como "Lucía-Chat", "Lucía-WhatsApp",
// "Lucía" a secas, etc.) dentro del MISMO evento? Si sí, Chat CSAT se puede calcular
// con la misma llamadasCsat() (parametrizada) apuntando a ese otro valor de agent.
// Si no aparece nada parecido a Chat, hay que buscar la fuente real en otro lado
// (property de ticket, otro evento, etc.) -- NO inventar un agente que no existe.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node diagnosticar_csat_agentes_evento.mjs

const HUBSPOT_BASE = "https://api.hubapi.com";
const EVENT_TYPE = "pe6180490_customer_survey_score";

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

// Rango amplio: desde antes de que arrancara Llamadas hasta hoy, para no perdernos
// nada que pudiera existir para Chat desde más atrás (Chat arranca feb-2026).
const DESDE = "2026-01-01T00:00:00.000Z";
const HASTA = "2026-09-23T00:00:00.000Z"; // ajustar si se corre otro día

console.log(`Trayendo TODOS los eventos ${EVENT_TYPE} entre ${DESDE} y ${HASTA} (todos los agentes)...`);
const eventos = await fetchAll(DESDE, HASTA);
console.log(`Total eventos: ${eventos.length}`);

const porAgente = new Map();
eventos.forEach((ev) => {
  const raw = ev.properties?.agent ?? "(vacío)";
  const entry = porAgente.get(raw) || { count: 0, ejemplos: [] };
  entry.count++;
  if (entry.ejemplos.length < 3) {
    entry.ejemplos.push({
      timestamp: ev.occurredAt,
      surveyscore: ev.properties?.surveyscore,
      surveykey: ev.properties?.surveykey,
      email: ev.properties?.email,
    });
  }
  porAgente.set(raw, entry);
});

console.log("\nValores distintos de 'agent' encontrados (valor -> cantidad):");
Array.from(porAgente.entries())
  .sort((a, b) => b[1].count - a[1].count)
  .forEach(([agente, entry]) => {
    console.log(`\n  "${agente}" -> ${entry.count} eventos`);
    entry.ejemplos.forEach((ej) => console.log(`      ej: ${JSON.stringify(ej)}`));
  });

console.log("\nSi ves algo como 'Lucía-Chat', 'Lucía-WhatsApp' o similar arriba, ese es el candidato para Chat CSAT.");
console.log("Si NO aparece nada parecido a Chat, el evento pe6180490_customer_survey_score no cubre ese canal.");
