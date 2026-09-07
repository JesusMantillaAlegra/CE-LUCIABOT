// El refresco de cubos de hoy (07-sep-2026) le devolvió a Chat de Febrero y Marzo:
// gestionados=0, escalados=0 -- reales, consultados en vivo contra HubSpot (no un bug de
// fecha/filtro obvio, ya se confirmó vía /api/history que el snapshot dice
// "generado": "2026-09-07"). Los valores viejos generados por Breeze (otra metodología,
// basada en threads/bandejas, NO en hubspot_owner_id) para esos mismos meses SÍ tenían
// actividad real (81 gestionados en feb, 203 en marzo, etc).
//
// Hipótesis: el mecanismo hubspot_owner_id=89503870 + pipeline Chats_Sup (validado 100%
// para AGOSTO) no estaba activo, o no se aplicó retroactivamente, en meses tan viejos como
// febrero/marzo. Este script recorre TODOS los meses de feb a agosto 2026 con la definición
// nueva (tickets), para encontrar en qué mes exacto empieza a haber señal real -- y así
// saber desde cuándo se puede confiar en el cubo en vivo de Chat vs. desde cuándo hay que
// dejar los datos viejos de Breeze quietos.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node diagnosticar_gestionados_por_mes.mjs

import { chatIngresadosGestionadosEscalados } from "./lib/hubspot.js";

const MESES = [
  ["2026-02-01", "2026-03-01", "febrero"],
  ["2026-03-01", "2026-04-01", "marzo"],
  ["2026-04-01", "2026-05-01", "abril"],
  ["2026-05-01", "2026-06-01", "mayo"],
  ["2026-06-01", "2026-07-01", "junio"],
  ["2026-07-01", "2026-08-01", "julio"],
  ["2026-08-01", "2026-09-01", "agosto"],
];

// Valores viejos de Breeze (metodología distinta: threads/bandejas, no owner_id) -- solo
// como referencia de si HABÍA actividad real del bot ese mes, no para que calcen exacto.
const VIEJO = {
  febrero: { demanda: 8465, ingresados_bot: 185, gestionados: 81, escalados: 104 },
  marzo: { demanda: 9377, ingresados_bot: 553, gestionados: 203, escalados: 350 },
  abril: { demanda: 8867, ingresados_bot: 1260, gestionados: 452, escalados: 808 },
  mayo: { demanda: 9147, ingresados_bot: 1879, gestionados: 764, escalados: 1115 },
  junio: { demanda: 8553, ingresados_bot: 4443, gestionados: 3048, escalados: 1395 },
  julio: { demanda: 9630, ingresados_bot: 7733, gestionados: 5436, escalados: 2295 },
  agosto: { demanda: 7278, ingresados_bot: 5792, gestionados: 4249, escalados: 1534 },
};

async function main() {
  for (const [inicio, finExclusivo, nombre] of MESES) {
    const nuevo = await chatIngresadosGestionadosEscalados(inicio, finExclusivo);
    const viejo = VIEJO[nombre];
    console.log(`--- ${nombre} 2026 ---`);
    console.log(`  NUEVO (tickets, owner=89503870/inbox_id_objetivo): demanda=${nuevo.ingresados} gestionados=${nuevo.gestionados} escalados=${nuevo.escalados}`);
    console.log(`  VIEJO (Breeze, threads/bandejas):                  demanda=${viejo.demanda} ingresados_bot=${viejo.ingresados_bot} gestionados=${viejo.gestionados} escalados=${viejo.escalados}`);
    console.log("");
  }
  console.log("Pégame TODA esta salida.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exitCode = 1;
});
