// Diagnóstico: encontrar (A) el nombre interno real de la propiedad "HD - Versión" en
// Tickets (para poder acotar correoDemandaCount() a Colombia igual que el informe nativo),
// y (B) el nombre interno real de la propiedad de fecha de cierre de un ticket (para poder
// calcular "Tiempo prom. de gestión" agrupando por cuándo se CERRÓ el ticket en vez de por
// cuándo se CREÓ -- ahora mismo mezcla tickets creados en agosto pero cerrados mucho después,
// lo que infla el promedio).
//
// No inventa nada: solo lista las propiedades reales del portal para que confirmemos el
// nombre exacto antes de tocar lib/hubspot.js otra vez.
//
// Uso (misma sesión de PowerShell donde ya pusiste $env:HUBSPOT_TEST_TOKEN):
//   node diagnosticar_correo_props.mjs

if (!process.env.HUBSPOT_TOKEN && process.env.HUBSPOT_TEST_TOKEN) {
  process.env.HUBSPOT_TOKEN = process.env.HUBSPOT_TEST_TOKEN;
}
const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('Falta HUBSPOT_TOKEN (o HUBSPOT_TEST_TOKEN) en esta sesión de PowerShell.');
  process.exit(1);
}
const HEADERS = { Authorization: `Bearer ${TOKEN}` };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} en ${url}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('Trayendo todas las propiedades de Tickets...\n');
  const data = await get('https://api.hubapi.com/crm/v3/properties/tickets');
  const props = data.results || [];

  console.log('--- Candidatas a "HD - Versión" (país del ticket) ---');
  props
    .filter((p) => /version|país|pais|hd[\s_-]/i.test(p.label) || /hd_version|version/i.test(p.name))
    .forEach((p) => {
      console.log(`  name: ${p.name}  |  label: "${p.label}"  |  tipo: ${p.type}/${p.fieldType}`);
      if (p.options?.length) {
        // OJO: en propiedades de enumeración, el filtro EQ necesita el VALUE interno,
        // no el label que se ve en pantalla -- pueden ser distintos (ej. "Colombia" vs "COL").
        console.log(`    opciones (label = value): ${p.options.map((o) => `"${o.label}" = "${o.value}"`).join(', ')}`);
      }
    });

  console.log('\n--- Candidatas a "fecha de cierre" ---');
  props
    .filter((p) => /close|cierre|cerrad/i.test(p.label) || /close/i.test(p.name))
    .forEach((p) => {
      console.log(`  name: ${p.name}  |  label: "${p.label}"  |  tipo: ${p.type}/${p.fieldType}`);
    });

  console.log('\n--- Candidatas a "bandeja de entrada" ---');
  props
    .filter((p) => /bandeja|inbox/i.test(p.label) || /inbox/i.test(p.name))
    .forEach((p) => {
      console.log(`  name: ${p.name}  |  label: "${p.label}"  |  tipo: ${p.type}/${p.fieldType}`);
      if (p.options?.length) {
        console.log(`    opciones: ${p.options.map((o) => o.label).join(', ')}`);
      }
    });

  console.log('\nCopia esta salida y pégamela -- con eso ajusto correoDemandaCount() y');
  console.log('correoTiempoPromedioGestionMin() en lib/hubspot.js con el nombre real de cada propiedad.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
