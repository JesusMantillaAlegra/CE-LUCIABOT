// Prueba rápida: verifica si el token en HUBSPOT_TEST_TOKEN puede leer la
// Conversations API real de HubSpot (hilos/mensajes del inbox, scope conversations.read).
// No toca el token que ya usa el dashboard en producción -- usa un nombre de
// variable de entorno distinto a propósito, para no pisar el existente.
//
// Uso (PowerShell, en esta carpeta):
//   $env:HUBSPOT_TEST_TOKEN = "tu-token-aqui"
//   node test_conversations_scope.mjs
//
// Uso (CMD):
//   set HUBSPOT_TEST_TOKEN=tu-token-aqui
//   node test_conversations_scope.mjs

const TOKEN = process.env.HUBSPOT_TEST_TOKEN;

if (!TOKEN) {
  console.error('Falta la variable de entorno HUBSPOT_TEST_TOKEN. Configúrala antes de correr este script.');
  process.exit(1);
}

async function probar(nombre, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const body = await res.json().catch(() => ({}));
  console.log(`Prueba: ${nombre}`);
  console.log(`  URL: ${url}`);
  console.log(`  HTTP status: ${res.status}`);
  if (res.ok) {
    console.log('  OK -- el token sí puede leer esto.');
    console.log('  Respuesta (recortada):', JSON.stringify(body, null, 2).slice(0, 600));
  } else {
    console.log('  FALLÓ.');
    console.log('  Detalle:', JSON.stringify(body).slice(0, 600));
  }
  console.log('');
}

async function main() {
  console.log('Probando acceso a la Conversations API real (inbox/hilos) con HUBSPOT_TEST_TOKEN...\n');

  // 1) Lista los inboxes de conversaciones -- requiere conversations.read
  await probar('Listar inboxes', 'https://api.hubapi.com/conversations/v3/conversations/inboxes');

  // 2) Lista hilos (threads) recientes -- requiere conversations.read
  await probar('Listar hilos (threads)', 'https://api.hubapi.com/conversations/v3/conversations/threads?limit=1');

  // 3) Control: TICKET, que ya sabemos que funciona hoy -- para confirmar que el
  // token nuevo en general sí sirve (y descartar que el problema sea el token, no el scope)
  await probar('Control: objeto TICKET (ya funciona hoy)', 'https://api.hubapi.com/crm/v3/objects/tickets?limit=1');
}

main().catch(err => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
