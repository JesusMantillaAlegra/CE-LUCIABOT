// Verifica qué puede y qué NO puede hacer el token que ya está en HUBSPOT_TOKEN en tu PC
// (el que dijiste que es el de Alegra, no el tuyo personal).
//
// No inventa nada: solo pega contra la API real y te muestra HTTP status + detalle
// de cada endpoint, para que confirmemos si tiene o no el scope de Conversations
// antes de repartir las llamadas del dashboard entre los dos tokens.
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node test_scope_alegra.mjs

const TOKEN = process.env.HUBSPOT_TOKEN;

if (!TOKEN) {
  console.error('Falta la variable de entorno HUBSPOT_TOKEN en esta sesión de PowerShell.');
  process.exit(1);
}

async function probar(nombre, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = await res.json().catch(() => ({}));
  console.log(`Prueba: ${nombre}`);
  console.log(`  URL: ${url}`);
  console.log(`  HTTP status: ${res.status}`);
  if (res.ok) {
    console.log('  OK -- el token SÍ puede leer esto.');
  } else {
    console.log('  FALLÓ -- el token NO puede leer esto (revisa el detalle abajo).');
    console.log('  Detalle:', JSON.stringify(body).slice(0, 600));
  }
  console.log('');
}

async function main() {
  console.log('Probando el token de HUBSPOT_TOKEN (supuestamente el de Alegra)...\n');

  // Controles que SÍ deberían funcionar si el token sirve para lo básico del dashboard hoy
  await probar('Control: objeto TICKET', 'https://api.hubapi.com/crm/v3/objects/tickets?limit=1');
  await probar('Control: objeto CALL', 'https://api.hubapi.com/crm/v3/objects/calls?limit=1');
  await probar('Control: propiedades de TICKET', 'https://api.hubapi.com/crm/v3/properties/tickets?limit=1');

  // Lo que queremos confirmar: ¿tiene scope de Conversations o no?
  await probar('Conversations: listar inboxes', 'https://api.hubapi.com/conversations/v3/conversations/inboxes');
  await probar('Conversations: listar hilos (threads)', 'https://api.hubapi.com/conversations/v3/conversations/threads?limit=1');

  console.log('Pégame toda esta salida completa.');
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
