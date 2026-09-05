// Mapea exactamente qué puede hacer el token que está en HUBSPOT_TOKEN en tu PC
// (el que dijiste que es el de Alegra) contra CADA endpoint real que usa lib/hubspot.js
// hoy -- no solo un par de controles genéricos, sino los mismos que usan
// correoDemandaCount, correoGestionadosCount, correoTiempoPromedioGestionMin,
// llamadasPorVersion, resolvePipelineStageLabels, y (para lo que viene) el
// historial de owner de un ticket -- y al final también Conversations, para
// confirmar si de verdad le falta ese scope o no.
//
// No inventa nada: son los mismos paths/métodos que ya están en lib/hubspot.js,
// con limit=1 (o un solo ticket real) para gastar lo mínimo posible de cuota.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node mapear_scope_alegra.mjs

const TOKEN = process.env.HUBSPOT_TOKEN;

if (!TOKEN) {
  console.error('Falta la variable de entorno HUBSPOT_TOKEN en esta sesión de PowerShell.');
  process.exit(1);
}

const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function probar(nombre, url, options = {}) {
  const res = await fetch(url, { headers: HEADERS, ...options });
  const body = await res.json().catch(() => ({}));
  console.log(`Prueba: ${nombre}`);
  console.log(`  ${options.method || 'GET'} ${url}`);
  console.log(`  HTTP status: ${res.status}`);
  if (res.ok) {
    console.log('  OK -- SÍ tiene permiso.');
  } else {
    console.log('  FALLÓ -- NO tiene permiso (o el request está mal armado, ver detalle).');
    console.log('  Detalle:', JSON.stringify(body).slice(0, 400));
  }
  console.log('');
  return { ok: res.ok, body };
}

async function main() {
  console.log('=== Mapeo de permisos del token en HUBSPOT_TOKEN (¿es el de Alegra?) ===\n');

  // 1) Tickets: leer + buscar (usado por Correo entero: Demanda, Gestionados, Escalados, Tiempo prom, CSAT, por_stage)
  await probar('Tickets: leer objeto', 'https://api.hubapi.com/crm/v3/objects/tickets?limit=1');
  const busqueda = await probar(
    'Tickets: search (el que usa Correo)',
    'https://api.hubapi.com/crm/v3/objects/tickets/search',
    { method: 'POST', body: JSON.stringify({ filterGroups: [], properties: ['hubspot_owner_id'], limit: 1 }) }
  );
  await probar('Tickets: propiedades (metadata)', 'https://api.hubapi.com/crm/v3/properties/tickets?limit=1');

  // 2) Historial de owner de un ticket real (lo que necesitaríamos para "ingresados_flujo" / owner-history)
  const idTicket = busqueda.ok ? busqueda.body.results?.[0]?.id : null;
  if (idTicket) {
    await probar(
      'Tickets: historial de owner (para owner-history / ingresados_flujo)',
      `https://api.hubapi.com/crm/v3/objects/tickets/${idTicket}?propertiesWithHistory=hubspot_owner_id`
    );
  } else {
    console.log('(No se pudo probar historial de owner: la búsqueda de tickets de arriba no devolvió ningún id.)\n');
  }

  // 3) Pipelines de tickets (usado por resolvePipelineStageLabels)
  await probar('Pipelines de tickets', 'https://api.hubapi.com/crm/v3/pipelines/tickets');

  // 4) Calls: leer + buscar (usado por Llamadas)
  await probar('Calls: leer objeto', 'https://api.hubapi.com/crm/v3/objects/calls?limit=1');
  await probar(
    'Calls: search (el que usa Llamadas)',
    'https://api.hubapi.com/crm/v3/objects/calls/search',
    { method: 'POST', body: JSON.stringify({ filterGroups: [], properties: ['estado_llamada'], limit: 1 }) }
  );

  // 5) Conversations (lo que sospechamos que NO tiene)
  await probar('Conversations: listar inboxes', 'https://api.hubapi.com/conversations/v3/conversations/inboxes');
  await probar('Conversations: listar hilos (threads)', 'https://api.hubapi.com/conversations/v3/conversations/threads?limit=1');

  console.log('Pégame toda esta salida completa -- con eso armo el reparto real de qué llamadas');
  console.log('puede absorber el token de Alegra y cuáles quedan obligadas a tu token personal.');
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
