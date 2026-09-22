// Diagnóstico CSAT de Lucía Llamadas (22-sep-2026) -- la tarjeta "CSAT" del dashboard
// salió en "—" / "sin encuestas en el período" apenas desplegado. Esto puede significar
// dos cosas muy distintas:
//   (a) el token no tiene scope para leer eventos de comportamiento (/events/v3/events)
//       -> llamadasCsat() atrapa el error y devuelve { promedio: null, total: 0, error }
//   (b) el token SÍ tiene el scope, pero de verdad no hay eventos "agent=Lucía-IVR" en el
//       rango de fechas que se está mirando en el dashboard
// Ambos casos se ven IGUAL en el dashboard ("sin encuestas"), así que hay que correr esto
// para diferenciarlos.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node diagnosticar_csat_llamadas.mjs

import { llamadasCsat } from "./lib/hubspot.js";

// Rango amplio (todo lo que cubre Llamadas desde que arrancó, ver CORREO_LLAMADAS_INICIO
// en lib/cubos.mjs) para no fallar por elegir mal el mes -- si acá también sale total:0
// sin error, es que de verdad no hay eventos con agent=Lucía-IVR (revisar el valor exacto
// de "agent" que manda el emisor real, puede no ser literal "Lucía-IVR").
const DESDE = "2026-07-01";
const HASTA = "2026-09-23"; // hoy + 1 día, ajustar si se corre después

console.log(`Consultando eventos pe6180490_customer_survey_score (agent=Lucía-IVR) entre ${DESDE} y ${HASTA}...`);

const r = await llamadasCsat(DESDE, HASTA);

console.log("\nResultado crudo de llamadasCsat():");
console.log(JSON.stringify(r, null, 2));

if (r.error) {
  console.log("\n=> Hubo un ERROR llamando a la API de eventos de HubSpot (ver 'error' arriba).");
  console.log("   Si el mensaje menciona 401/403 o 'scope', el Private App token no tiene");
  console.log("   permiso para leer Custom Behavioral Events -- hay que agregarle ese scope");
  console.log("   en HubSpot (Configuración -> Integraciones -> Apps privadas -> tu app ->");
  console.log("   pestaña Scopes) y volver a generar/copiar el token si HubSpot lo pide.");
} else if (r.total === 0) {
  console.log("\n=> No hubo error de API, pero 0 eventos calzaron con agent=Lucía-IVR en el rango.");
  console.log("   Puede ser que el campo 'agent' real no diga literalmente 'Lucía-IVR' (revisar");
  console.log("   mayúsculas/tildes/guion) o que el rango de fechas no tenga encuestas todavía.");
  console.log("   Corre este mismo diagnóstico ampliando DESDE/HASTA, o revisa en HubSpot");
  console.log("   (Gestión de eventos -> Encuesta de satisfacción CS -> pestaña Apariciones)");
  console.log("   qué valor exacto trae 'agent' en un evento reciente de una llamada de Lucía.");
} else {
  console.log(`\n=> OK: ${r.total} encuestas válidas, promedio ${r.promedio}, ${r.descartados} descartadas por estar fuera de 1-10.`);
  console.log("   Si el dashboard sigue mostrando '—', el problema está en el snapshot guardado");
  console.log("   (probablemente no se ha vuelto a correr /api/cubos-refrescar todavía con el");
  console.log("   código nuevo) -- no en esta función.");
}
