// lib/fechas.mjs
//
// Lista los meses calendario que se solapan con un rango [start, end] (ISO
// YYYY-MM-DD o completo). La usa lib/cubos.mjs para saber qué meses hay que
// calcular/backfillear. Copiado y adaptado de
// ce-retention-soporte-ops/lib/fechas.mjs (mismo patrón, sin las etiquetas
// de gráfico que allá no hacen falta acá).

export function mesesEnRango(startISO, endISO) {
  const meses = [];
  let cursor = new Date(`${startISO.slice(0, 10)}T00:00:00.000Z`);
  cursor.setUTCDate(1);
  const limite = new Date(`${endISO.slice(0, 10)}T00:00:00.000Z`);
  while (cursor <= limite) {
    const anio = cursor.getUTCFullYear();
    const mes = cursor.getUTCMonth();
    const id = `${anio}-${String(mes + 1).padStart(2, "0")}`;
    const inicio = cursor.toISOString().slice(0, 10);
    // primer día del mes siguiente (exclusivo) -- así encaja directo con el
    // segundo argumento de dateRangeFilters() en lib/hubspot.js.
    const finExclusivo = new Date(Date.UTC(anio, mes + 1, 1)).toISOString().slice(0, 10);
    meses.push({ id, inicio, finExclusivo });
    cursor = new Date(Date.UTC(anio, mes + 1, 1));
  }
  return meses;
}
