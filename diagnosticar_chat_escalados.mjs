// Ya confirmamos con el thread real 11060016445 que Lucía en Chat es el mismo owner
// que en Correo: hubspot_owner_id = 89503870 (actorId A-89503870 en Conversations).
// Y que categoria_bot_lucia="Gestionadas" coincide con ese caso.
//
// Falta UNA sola cosa antes de escribir chatIngresadosGestionadosEscalados(): cómo se
// marca "Escalado" en Chat. En Correo es escalamiento_lucia_email (HAS_PROPERTY). Este
// script:
//   Paso A: busca en /crm/v3/properties/tickets cualquier propiedad que tenga
//           "escalamiento" o "escalad" en el nombre o label (candidato directo al
//           equivalente de escalamiento_lucia_email para Chat).
//   Paso B: para agosto 2026 en Chats_Sup (125444762), cuenta tickets totales,
//           cuántos tienen hubspot_owner_id=89503870, y cruza contra
//           categoria_bot_lucia -- para confirmar que "owner=Lucía" y
//           "categoria_bot_lucia=Gestionadas" son básicamente el mismo universo.
//   Paso C: si el Paso A encontró candidatos, cuenta cuántos tickets de Chats_Sup en
//           agosto tienen esa propiedad poblada (HAS_PROPERTY) -- ese sería "Escalados".
//
// Uso (misma sesión de PowerShell donde ya está $env:HUBSPOT_TOKEN puesto):
//   node diagnosticar_chat_escalados.mjs

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error("Falta la variable de entorno HUBSPOT_TOKEN en esta sesión de PowerShell.");
  process.exitCode = 1;
}
const HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const CHATS_SUP_PIPELINE_ID = "125444762";
const LUCIA_OWNER_ID = "89503870";

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} en ${url}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}
async function post(url, payload) {
  const res = await fetch(url, { method: "POST", headers: HEADERS, body: JSON.stringify(payload) });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} en ${url}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

async function main() {
  console.log("Paso A: buscando propiedades de ticket relacionadas con escalamiento/transferencia...\n");
  const propDefs = await get("https://api.hubapi.com/crm/v3/properties/tickets?archived=false");
  const candidatas = (propDefs.results || []).filter(
    (p) => /escalam|escalad|transfer/i.test(p.name) || /escalam|escalad|transfer/i.test(p.label || "")
  );
  console.log(`Encontradas ${candidatas.length}:`);
  candidatas.forEach((p) => console.log(`  ${p.name} (label: "${p.label}", tipo: ${p.type})`));

  console.log("\nPaso B: tickets de Chats_Sup en agosto 2026 -- total, por owner, por categoria_bot_lucia...\n");
  const desdeMs = String(Date.parse("2026-08-01T00:00:00.000Z"));
  const hastaMs = String(Date.parse("2026-09-01T00:00:00.000Z"));
  const baseFilters = [
    { propertyName: "hs_pipeline", operator: "EQ", value: CHATS_SUP_PIPELINE_ID },
    { propertyName: "createdate", operator: "GTE", value: desdeMs },
    { propertyName: "createdate", operator: "LT", value: hastaMs },
  ];

  const props = ["hubspot_owner_id", "categoria_bot_lucia", "chat_transferido", "hs_pipeline_stage"];
  const all = [];
  let after;
  do {
    const body = { filterGroups: [{ filters: baseFilters }], properties: props, limit: 100 };
    if (after) body.after = after;
    const page = await post("https://api.hubapi.com/crm/v3/objects/tickets/search", body);
    all.push(...(page.results || []));
    after = page.paging?.next?.after;
  } while (after && all.length < 2000);

  console.log(`Total tickets Chats_Sup agosto 2026: ${all.length}\n`);

  const porOwner = new Map();
  const porCategoria = new Map();
  const porTransferido = new Map();
  let ownerLuciaYCategoriaGestionadas = 0;
  let ownerLucia = 0;
  let categoriaGestionadas = 0;

  all.forEach((t) => {
    const owner = t.properties.hubspot_owner_id || "(vacío)";
    const cat = (t.properties.categoria_bot_lucia || "(vacío)").toLowerCase();
    const transf = t.properties.chat_transferido || "(vacío)";
    porOwner.set(owner, (porOwner.get(owner) || 0) + 1);
    porCategoria.set(cat, (porCategoria.get(cat) || 0) + 1);
    porTransferido.set(transf, (porTransferido.get(transf) || 0) + 1);
    if (owner === LUCIA_OWNER_ID) ownerLucia++;
    if (cat === "gestionadas") categoriaGestionadas++;
    if (owner === LUCIA_OWNER_ID && cat === "gestionadas") ownerLuciaYCategoriaGestionadas++;
  });

  console.log("Por hubspot_owner_id (top 10):", JSON.stringify(Object.fromEntries([...porOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))));
  console.log("Por categoria_bot_lucia:", JSON.stringify(Object.fromEntries(porCategoria)));
  console.log("Por chat_transferido:", JSON.stringify(Object.fromEntries(porTransferido)));
  console.log(`\nowner=Lucía (${LUCIA_OWNER_ID}): ${ownerLucia}`);
  console.log(`categoria_bot_lucia=gestionadas: ${categoriaGestionadas}`);
  console.log(`ambos a la vez: ${ownerLuciaYCategoriaGestionadas}`);

  if (candidatas.length) {
    console.log("\nPaso C: contando tickets de Chats_Sup en agosto con cada propiedad candidata poblada (HAS_PROPERTY)...\n");
    for (const p of candidatas) {
      const filters = [...baseFilters, { propertyName: p.name, operator: "HAS_PROPERTY" }];
      const page = await post("https://api.hubapi.com/crm/v3/objects/tickets/search", {
        filterGroups: [{ filters }],
        properties: [],
        limit: 1,
      });
      console.log(`  ${p.name}: ${page.total || 0} tickets con valor`);
    }
  } else {
    console.log("\nPaso C: no hay candidatas directas -- revisar manualmente el stage/pipeline como señal de escalado.");
  }

  console.log("\nPégame TODA esta salida.");
}

if (TOKEN) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exitCode = 1;
  });
}
