// Ya tenemos un thread REAL de agosto 2026 (no de 2020): el ticket "Test escalamiento
// ticekts" en Chats_Sup trae hs_conversations_originating_thread_id = 11060016445.
// Este script va DIRECTO a ese thread puntual -- sin buscar nada, sin depender de sort
// ni de paginar -- y muestra:
//   Paso A: el JSON crudo COMPLETO del thread (por si hay algún campo chatflowId/bot/
//           channel que no hemos visto todavía).
//   Paso B: todos sus mensajes, con senders[] y texto.
//   Paso C: cada actorId único resuelto contra /conversations/v3/conversations/actors/{id}
//           -- ahí vemos si de verdad existe un actor con type=BOT, o si Lucía aparece
//           como AGENT/SYSTEM/INTEGRATOR.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node diagnosticar_thread_real.mjs

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error("Falta la variable de entorno HUBSPOT_TOKEN en esta sesión de PowerShell.");
  process.exitCode = 1;
}
const HEADERS = { Authorization: `Bearer ${TOKEN}` };
const THREAD_ID = "11060016445";

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} en ${url}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

async function main() {
  console.log(`Paso A: trayendo el thread real ${THREAD_ID} (JSON crudo completo)...\n`);
  const thread = await get(`https://api.hubapi.com/conversations/v3/conversations/threads/${THREAD_ID}`);
  console.log(JSON.stringify(thread, null, 2));

  console.log(`\nPaso B: mensajes del thread ${THREAD_ID}...\n`);
  const msgs = await get(`https://api.hubapi.com/conversations/v3/conversations/threads/${THREAD_ID}/messages?limit=100`);
  const resultados = msgs.results || [];
  console.log(`${resultados.length} mensajes.\n`);
  resultados.forEach((m, i) => {
    console.log(`--- mensaje[${i}] ---`);
    console.log(`  type=${m.type}`);
    console.log(`  senders=${JSON.stringify(m.senders)}`);
    console.log(`  recipients=${JSON.stringify(m.recipients)}`);
    console.log(`  text="${(m.text || "").slice(0, 150)}"`);
    console.log("");
  });

  const actorIds = new Set();
  resultados.forEach((m) => (m.senders || []).forEach((s) => s.actorId && actorIds.add(s.actorId)));
  (thread.assignedActorId ? [thread.assignedActorId] : []).forEach((id) => actorIds.add(id));

  console.log(`Paso C: resolviendo ${actorIds.size} actorId únicos de este thread real...\n`);
  for (const actorId of actorIds) {
    try {
      const actor = await get(`https://api.hubapi.com/conversations/v3/conversations/actors/${encodeURIComponent(actorId)}`);
      console.log(`  ${actorId} ->`, JSON.stringify(actor));
    } catch (e) {
      console.log(`  ${actorId} -> ERROR: ${e.message}`);
    }
  }

  console.log("\nPégame TODA esta salida (Pasos A, B y C completos).");
}

if (TOKEN) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exitCode = 1;
  });
}
