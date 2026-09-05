// Validación general: trae por API (lib/hubspot.js, sin Breeze ni MCP) todas las
// métricas de agosto 2026 que ya tenemos guardadas "a mano" en
// lucia_dashboard_history.json (snapshots correo-month-2026-08, chat-month-2026-08,
// llamadas-month-2026-08), y las compara lado a lado.
//
// OJO con las fechas: esos tres snapshots dicen "Agosto 2026 (parcial, hasta el 28)" --
// así que este script consulta el mismo corte (01-ago a 28-ago inclusive) para que la
// comparación sea justa. Si corres esto después del 28-ago real, los números pueden
// variar un poco frente a lo guardado simplemente porque hay más días de agosto
// cargados en HubSpot ahora que cuando se capturó el snapshot -- eso NO es un error,
// solo aclara la fecha de corte en la salida.
//
// Uso (misma sesión de PowerShell donde ya pusiste $env:HUBSPOT_TEST_TOKEN, y esa
// key ya tiene tickets+calls+conversations habilitado):
//   node validar_agosto_todo.mjs

import { readFileSync } from 'node:fs';

// lib/hubspot.js lee HUBSPOT_TOKEN -- si solo pusiste HUBSPOT_TEST_TOKEN, lo mapeamos acá
// para no tener que duplicar la variable.
if (!process.env.HUBSPOT_TOKEN && process.env.HUBSPOT_TEST_TOKEN) {
  process.env.HUBSPOT_TOKEN = process.env.HUBSPOT_TEST_TOKEN;
}
if (!process.env.HUBSPOT_TOKEN) {
  console.error('Falta HUBSPOT_TOKEN (o HUBSPOT_TEST_TOKEN) en esta sesión de PowerShell.');
  process.exit(1);
}

const {
  correoDemandaCount,
  correoGestionadosCount,
  correoEscaladosCount,
  correoTiempoPromedioGestionMin,
  llamadasPorVersion,
  chatDemandaCount,
} = await import('./lib/hubspot.js');

const DESDE = '2026-08-01';
const HASTA_EXCLUSIVE = '2026-08-29'; // = "hasta el 28-ago inclusive", mismo corte que el snapshot guardado

function leerHardcodeado() {
  const data = JSON.parse(readFileSync('./lucia_dashboard_history.json', 'utf8'));
  const porId = Object.fromEntries(data.snapshots.map((s) => [s.id, s]));
  return {
    correo: porId['correo-month-2026-08']?.correo,
    chat: porId['chat-month-2026-08']?.chat,
    llamadas: porId['llamadas-month-2026-08']?.llamadas,
  };
}

function fila(nombre, apiValor, hardValor) {
  const iguales = apiValor === hardValor || (typeof apiValor === 'number' && typeof hardValor === 'number' && Math.abs(apiValor - hardValor) < 0.5);
  const marca = iguales ? 'OK' : 'DIFERENTE';
  console.log(`  ${nombre.padEnd(28)} API: ${String(apiValor).padEnd(12)} Guardado: ${String(hardValor).padEnd(12)} [${marca}]`);
}

async function main() {
  console.log(`Comparando agosto 2026 (${DESDE} a ${HASTA_EXCLUSIVE}, exclusivo) -- API en vivo vs. lo guardado en lucia_dashboard_history.json\n`);
  const hard = leerHardcodeado();

  // ---------- CORREO ----------
  console.log('=== CORREO ===');
  const [demandaCorreo, gestionadosCorreo, escaladosCorreo, tiempoCorreo] = await Promise.all([
    correoDemandaCount(DESDE, HASTA_EXCLUSIVE),
    correoGestionadosCount(DESDE, HASTA_EXCLUSIVE),
    correoEscaladosCount(DESDE, HASTA_EXCLUSIVE),
    correoTiempoPromedioGestionMin(DESDE, HASTA_EXCLUSIVE),
  ]);
  fila('Demanda', demandaCorreo, hard.correo?.kpis?.demanda);
  fila('Gestionados', gestionadosCorreo, hard.correo?.kpis?.gestionados);
  fila('Escalados', escaladosCorreo, hard.correo?.kpis?.escalados);
  fila('Tiempo prom. gestión (min)', tiempoCorreo, hard.correo?.tiempo_promedio_gestion_min);
  console.log('');

  // ---------- LLAMADAS ----------
  console.log('=== LLAMADAS ===');
  const { porVersion, motivo_escalamiento } = await llamadasPorVersion(DESDE, HASTA_EXCLUSIVE);
  const totalesApi = porVersion.reduce(
    (acc, v) => ({
      demanda: acc.demanda + v.demanda,
      gestionadas: acc.gestionadas + v.gestionadas,
      escaladas: acc.escaladas + v.escaladas,
      no_contestadas: acc.no_contestadas + v.no_contestadas,
    }),
    { demanda: 0, gestionadas: 0, escaladas: 0, no_contestadas: 0 }
  );
  fila('Demanda (total)', totalesApi.demanda, hard.llamadas?.kpis?.demanda);
  fila('Gestionadas (total)', totalesApi.gestionadas, hard.llamadas?.kpis?.gestionadas);
  fila('Escaladas (total)', totalesApi.escaladas, hard.llamadas?.kpis?.escaladas);
  fila('No contestadas (total)', totalesApi.no_contestadas, hard.llamadas?.kpis?.no_contestadas);
  porVersion.forEach((v) => {
    const guardadoVersion = (hard.llamadas?.por_version || []).find((x) => x.version === v.version);
    fila(`Demanda ${v.version}`, v.demanda, guardadoVersion?.demanda);
  });
  console.log('  Motivos de escalamiento (API):', JSON.stringify(motivo_escalamiento));
  console.log('  Motivos de escalamiento (guardado):', JSON.stringify(hard.llamadas?.motivo_escalamiento));
  console.log('');

  // ---------- CHAT ----------
  console.log('=== CHAT ===');
  const demandaChat = await chatDemandaCount(DESDE, HASTA_EXCLUSIVE);
  fila('Demanda', demandaChat, hard.chat?.kpis?.demanda);
  console.log('  (Ingresados/Gestionados/Escalados/CSAT/Tiempo de Chat no se validan acá todavía --');
  console.log('   requieren confirmar antes en qué campo vive la señal de "atendido por bot", ver validar_agosto_chat.mjs)');
  console.log('');

  console.log('Listo. Revisa las filas marcadas [DIFERENTE] -- puede ser por el corte de fecha (si corriste esto');
  console.log('después del 28-ago real) o por una diferencia real de metodología que hay que investigar.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
