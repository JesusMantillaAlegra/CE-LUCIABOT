// Valida chatIngresadosGestionadosEscalados() recién implementada, contra agosto 2026.
// Esperado (según diagnosticar_chat_escalados.mjs sobre 2000 tickets de muestra, el total
// real puede ser algo mayor porque ese diagnóstico tenía un tope de 2000 filas):
//   ingresados  ~ 8357-8358 (mismo universo que chatDemandaTicketsCount, ya validado)
//   gestionados ~ proporcional a los 1105/2000 que vimos (owner=Lucía)
//   escalados   ~ proporcional a los 104/2000 que vimos (inbox_id_objetivo poblado)
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node validar_chat_funnel.mjs

import { chatIngresadosGestionadosEscalados, chatDemandaTicketsCount } from "./lib/hubspot.js";

async function main() {
  const [funnel, demanda] = await Promise.all([
    chatIngresadosGestionadosEscalados("2026-08-01", "2026-09-01"),
    chatDemandaTicketsCount("2026-08-01", "2026-09-01"),
  ]);
  console.log("chatIngresadosGestionadosEscalados() agosto 2026:", funnel);
  console.log("chatDemandaTicketsCount() agosto 2026 (ya validado, referencia):", demanda);
  console.log(
    funnel.ingresados === demanda
      ? "OK: ingresados coincide exacto con chatDemandaTicketsCount."
      : `Ojo: ingresados (${funnel.ingresados}) difiere de chatDemandaTicketsCount (${demanda}) -- deberían ser el mismo filtro.`
  );
  const pctGestionados = ((funnel.gestionados / funnel.ingresados) * 100).toFixed(1);
  const pctEscalados = ((funnel.escalados / funnel.ingresados) * 100).toFixed(1);
  console.log(`% gestionados sobre ingresados: ${pctGestionados}%`);
  console.log(`% escalados sobre ingresados: ${pctEscalados}%`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exitCode = 1;
});
