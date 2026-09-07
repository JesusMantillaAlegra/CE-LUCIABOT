// Valida chatDemandaTicketsCount() (nueva, basada en tickets del pipeline Chats_Sup)
// contra el número que confirmó Breeze para agosto 2026: 8357 tickets.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node validar_chat_demanda_tickets.mjs

import { chatDemandaTicketsCount } from "./lib/hubspot.js";

async function main() {
  const agosto = await chatDemandaTicketsCount("2026-08-01", "2026-09-01");
  console.log(`Demanda Chat (tickets en Chats_Sup) agosto 2026: ${agosto}`);
  console.log(`Breeze confirmó: 8357 -- ${agosto === 8357 ? "EXACTO" : "diferencia de " + (agosto - 8357)}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exitCode = 1;
});
