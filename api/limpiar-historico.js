// api/limpiar-historico.js
//
// POST /api/limpiar-historico
//
// Saca del histórico en KV los snapshots que quedaron completamente vacíos
// (Correo, Chat Y Llamadas los tres en null/ausentes a la vez) -- son
// placeholders de meses viejos que alguien fue "apagando" a mano (ver las
// notas _nota_*_limitado_*/_migrado_* dentro de cada uno) y que ya no aportan
// ningún dato real al dashboard. Sacarlos NO toca ningún número: por
// definición no tienen nada que restar de ningún KPI, solo limpian el
// histórico para que no queden meses "fantasma" ni notas contradictorias
// dando vueltas.
//
// Por seguridad, por default es DRY RUN: devuelve qué borraría, sin tocar
// KV. Hay que pasar ?aplicar=1 para que de verdad reemplace el histórico.
//
// Requiere el mismo CRON_SECRET que /api/seed y /api/snapshot.
//
// Uso:
//   Ver qué se borraría (no toca nada):
//     Invoke-WebRequest -Method POST -Uri ".../api/limpiar-historico" -Headers @{ Authorization = "Bearer <CRON_SECRET>" }
//   Aplicar de verdad:
//     Invoke-WebRequest -Method POST -Uri ".../api/limpiar-historico?aplicar=1" -Headers @{ Authorization = "Bearer <CRON_SECRET>" }

import { leerHistorico, reemplazarHistorico } from "../lib/store.mjs";

function estaCompletamenteVacio(snapshot) {
  return !snapshot.correo && !snapshot.chat && !snapshot.llamadas;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: "Falta CRON_SECRET" });
  const auth = req.headers.authorization || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || req.query?.secret;
  if (provided !== secret) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const historico = await leerHistorico();
    const aBorrar = historico.filter(estaCompletamenteVacio);
    const aConservar = historico.filter((s) => !estaCompletamenteVacio(s));

    const resumen = {
      total_actual: historico.length,
      vacios_encontrados: aBorrar.length,
      quedarian: aConservar.length,
      ids_a_borrar: aBorrar.map((s) => s.id),
      ids_a_conservar: aConservar.map((s) => s.id),
    };

    const aplicar = req.query?.aplicar === "1";
    if (!aplicar) {
      return res.status(200).json({ ok: true, dry_run: true, nota: "No se tocó KV. Llamar con ?aplicar=1 para de verdad limpiar.", ...resumen });
    }

    if (!aBorrar.length) {
      return res.status(200).json({ ok: true, dry_run: false, nota: "No había nada que limpiar.", ...resumen });
    }

    const { total } = await reemplazarHistorico(aConservar);
    return res.status(200).json({ ok: true, dry_run: false, total_final: total, ...resumen });
  } catch (e) {
    return res.status(500).json({ error: "Falló la limpieza", detalle: String(e.message ?? e) });
  }
}
