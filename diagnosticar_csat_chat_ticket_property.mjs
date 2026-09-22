// Diagnóstico CSAT Chat -- ¿existe la property de encuesta CES/CSAT del ticket
// (la misma que usa Correo: clasificacion_encuesta_ces_csat) también en tickets de
// Chat (pipeline Chats_Sup, 125444762)? (22-sep-2026)
//
// Contexto: diagnosticar_csat_agentes_evento.mjs ya mostró que el evento de
// comportamiento "Encuesta de satisfacción CS" (pe6180490_customer_survey_score) NO
// tiene ningún agente tipo "Lucía-Chat" -- todos sus valores de "agent" son o bien
// colas de IVR (Lucia-IVR, Lucia-IVR-dom, Laura IVR DE, Paula IVR pay, etc.) o nombres
// de personas (agentes humanos), nada de Chat/WhatsApp. Ese evento entonces NO cubre
// Chat -- hay que descartarlo como fuente para este canal.
//
// Este script prueba la otra fuente conocida: la property de ticket
// "clasificacion_encuesta_ces_csat" que Correo ya usa (Promoter/Passive/Detractor),
// pero filtrando por el pipeline de Chat en vez de source_type=EMAIL. Si HubSpot manda
// esa encuesta también a tickets de Chats_Sup, esto debería traer resultados.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node diagnosticar_csat_chat_ticket_property.mjs

const HUBSPOT_BASE = "https://api.hubapi.com";
const CHATS_SUP_PIPELINE_ID = "125444762";
const LUCIA_OWNER_ID = "89503870";
const NOISE_PIPELINE_ID = "1860940";

function hsHeaders() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("Falta $env:HUBSPOT_TOKEN en esta sesión de PowerShell.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function searchTicketsAll({ filterGroups, properties = [] }) {
  const all = [];
  let after;
  do {
    const body = { filterGroups, properties, limit: 100 };
    if (after) body.after = after;
    const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/tickets/search`, {
      method: "POST",
      headers: hsHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const page = await res.json();
    all.push(...(page.results || []));
    after = page.paging?.next?.after;
    if (after) await new Promise((r) => setTimeout(r, 150));
  } while (after);
  return all;
}

console.log("--- Prueba 1: tickets de Chats_Sup (cualquier owner) CON clasificacion_encuesta_ces_csat poblada, sin filtro de fecha ---");
const prueba1 = await searchTicketsAll({
  filterGroups: [{
    filters: [
      { propertyName: "hs_pipeline", operator: "EQ", value: CHATS_SUP_PIPELINE_ID },
      { propertyName: "clasificacion_encuesta_ces_csat", operator: "HAS_PROPERTY" },
    ],
  }],
  properties: ["clasificacion_encuesta_ces_csat", "hubspot_owner_id", "createdate", "source_type"],
});
console.log(`Total encontrados: ${prueba1.length}`);
prueba1.slice(0, 10).forEach((t) => console.log(`  id=${t.id} owner=${t.properties.hubspot_owner_id} valor=${t.properties.clasificacion_encuesta_ces_csat} createdate=${t.properties.createdate} source_type=${t.properties.source_type}`));

console.log("\n--- Prueba 2: mismo filtro pero solo owner=Lucía (89503870) ---");
const prueba2 = await searchTicketsAll({
  filterGroups: [{
    filters: [
      { propertyName: "hs_pipeline", operator: "EQ", value: CHATS_SUP_PIPELINE_ID },
      { propertyName: "hubspot_owner_id", operator: "EQ", value: LUCIA_OWNER_ID },
      { propertyName: "clasificacion_encuesta_ces_csat", operator: "HAS_PROPERTY" },
    ],
  }],
  properties: ["clasificacion_encuesta_ces_csat", "createdate"],
});
console.log(`Total encontrados (solo Lucía): ${prueba2.length}`);
prueba2.slice(0, 10).forEach((t) => console.log(`  id=${t.id} valor=${t.properties.clasificacion_encuesta_ces_csat} createdate=${t.properties.createdate}`));

console.log("\n--- Prueba 3: ¿cuántos tickets en total tiene Chats_Sup (sin filtro de encuesta), para tener referencia de tamaño? ---");
const prueba3 = await searchTicketsAll({
  filterGroups: [{
    filters: [
      { propertyName: "hs_pipeline", operator: "EQ", value: CHATS_SUP_PIPELINE_ID },
      { propertyName: "hs_pipeline", operator: "NEQ", value: NOISE_PIPELINE_ID },
    ],
  }],
  properties: [],
});
console.log(`Total tickets en Chats_Sup: ${prueba3.length}`);

console.log("\nConclusión a sacar:");
console.log("- Si Prueba 1 trae 0: esa property de encuesta NO se está usando en tickets de Chat -- hay que descartarla también.");
console.log("- Si Prueba 1 trae resultados pero Prueba 2 (solo Lucía) trae 0: la encuesta existe en Chat pero solo para agentes humanos que escalan, no para lo que gestiona el bot -- no serviría como 'CSAT del bot'.");
console.log("- Si Prueba 2 trae resultados: ahí sí hay una fuente real para CSAT de Chat gestionado por Lucía, calculable igual que Correo (Promoter/Passive/Detractor).");
