// lib/cubos.mjs
//
// Cubos mensuales de Correo y Llamadas (5-sep-2026): un snapshot mensual por
// canal, calculado en vivo contra HubSpot UNA VEZ y guardado en el mismo
// histórico de KV que ya lee el tablero (lib/store.mjs → guardarSnapshot),
// con el mismo id que ya usaban los snapshots manuales (`correo-month-YYYY-MM`,
// `llamadas-month-YYYY-MM`). Por eso este cubo no necesita ningún cambio en
// index.html/api/history.js -- es la MISMA forma de dato que el tablero ya
// sabe leer, solo que ahora se recalcula en vivo en vez de a mano con Breeze.
//
// La idea (a pedido de Jesús) es la misma que ce-retention-soporte-ops/lib/cubos.mjs:
// no volver a pedirle todo a HubSpot en cada carga del tablero -- eso es lo que
// hacía el flujo viejo de "actualizar-semanal". Un mes "estable" (terminó hace
// rato, ya no va a cambiar) se calcula una sola vez y se deja quieto; un mes
// "inestable" (el actual o uno reciente) se recalcula cada vez que corre el
// refresco, para ir reflejando cierres/reasignaciones tardías.
//
// OJO -- Chat queda AFUERA de este archivo a propósito: el embudo de
// Ingresados/Gestionados/Escalados de Chat (chatIngresadosGestionadosEscalados
// en lib/hubspot.js) todavía está bloqueado -- no se sabe en qué propiedad de
// la Conversations API vive la señal de "atendido por bot". Escribir un
// snapshot de Chat solo con `demanda` y todo lo demás en 0 rompería los % de
// gestión agregados en index.html (0% en vez de "no disponible"). Cuando esa
// función se implemente y valide, este archivo se extiende con
// construirSnapshotChat() siguiendo el mismo patrón de abajo.

import {
  correoDemandaCount,
  correoGestionadosCount,
  correoEscaladosCount,
  correoIngresadosFlujo,
  correoCsatSemana,
  correoTiempoPromedioGestionMin,
  correoTiempoCierreMedianaDias,
  correoTiempoPrimeraRespuestaMedianaMin,
  llamadasPorVersion,
} from "./hubspot.js";
import { guardarSnapshot } from "./store.mjs";
import { mesesEnRango } from "./fechas.mjs";

// Un mes es "estable" (no va a cambiar más) cuando terminó hace más de esto.
// Mismo margen que Retention: los tickets casi nunca se reabren/cierran más
// de un par de meses después de creados.
const MES_ESTABLE_DIAS = 60;
export function mesEstable(finExclusivoISO) {
  const fin = new Date(`${finExclusivoISO}T00:00:00.000Z`);
  return Date.now() - fin.getTime() > MES_ESTABLE_DIAS * 24 * 3_600_000;
}

function etiquetaMes(mes) {
  const [anio, m] = mes.id.split("-");
  const NOMBRES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${NOMBRES[Number(m) - 1]} ${anio}`;
}

async function construirSnapshotCorreo(mes) {
  const { inicio, finExclusivo } = mes;
  const [demanda, gestionados, escalados, flujo, csat, tiempoGestion, cierre, primeraResp] = await Promise.all([
    correoDemandaCount(inicio, finExclusivo),
    correoGestionadosCount(inicio, finExclusivo),
    correoEscaladosCount(inicio, finExclusivo),
    correoIngresadosFlujo(inicio, finExclusivo),
    correoCsatSemana(inicio, finExclusivo),
    correoTiempoPromedioGestionMin(inicio, finExclusivo),
    correoTiempoCierreMedianaDias(inicio, finExclusivo),
    correoTiempoPrimeraRespuestaMedianaMin(inicio, finExclusivo),
  ]);
  const csatTotal = csat.promoter + csat.passive + csat.detractor;
  return {
    id: `correo-month-${mes.id}`,
    semana_inicio: inicio,
    semana_fin: finExclusivo,
    generado: new Date().toISOString().slice(0, 10),
    bootstrap: false,
    etiqueta: `${etiquetaMes(mes)} (Correo, calculado en vivo)`,
    chat: null,
    llamadas: null,
    correo: {
      kpis: {
        demanda,
        gestionados,
        escalados,
        pct_gestion: demanda ? +((100 * gestionados) / demanda).toFixed(2) : 0,
        pct_escalados: demanda ? +((100 * escalados) / demanda).toFixed(2) : 0,
        csat_bot: csatTotal ? +((100 * csat.promoter) / csatTotal).toFixed(1) : null,
        ingresados_flujo: flujo.ingresados,
      },
      csat_detalle: csatTotal ? { positivas: csat.promoter, total: csatTotal, pct: +((100 * csat.promoter) / csatTotal).toFixed(1) } : null,
      tiempo_promedio_gestion_min: tiempoGestion,
      tiempo_primera_respuesta_mediana_min: primeraResp.mediana_min,
      tiempo_cierre_mediana_dias: cierre.mediana_dias,
      _nota_cubo_en_vivo: `Calculado en vivo el ${new Date().toISOString()} por lib/cubos.mjs. Detalle flujo: gestionados=${flujo.gestionados}, escalados=${flujo.escalados}, no_ingresaron=${flujo.no_ingresaron}. Mediana de cierre: n=${cierre.n}, censura_aplicada=${cierre.censura_aplicada}. Mediana primera respuesta: n=${primeraResp.n}.`,
    },
  };
}

async function construirSnapshotLlamadas(mes) {
  const { inicio, finExclusivo } = mes;
  const { porVersion, motivo_escalamiento } = await llamadasPorVersion(inicio, finExclusivo);
  const kpis = porVersion.reduce(
    (acc, v) => {
      acc.demanda += v.demanda;
      acc.gestionadas += v.gestionadas;
      acc.escaladas += v.escaladas;
      acc.no_contestadas += v.no_contestadas;
      acc.sin_clasificar += v.sin_clasificar;
      if (typeof v.duracion_prom_seg === "number") { acc._durSum += v.duracion_prom_seg * v.demanda; acc._durPeso += v.demanda; }
      return acc;
    },
    { demanda: 0, gestionadas: 0, escaladas: 0, no_contestadas: 0, sin_clasificar: 0, _durSum: 0, _durPeso: 0 }
  );
  const duracion_prom_seg = kpis._durPeso ? +(kpis._durSum / kpis._durPeso).toFixed(1) : null;
  return {
    id: `llamadas-month-${mes.id}`,
    semana_inicio: inicio,
    semana_fin: finExclusivo,
    generado: new Date().toISOString().slice(0, 10),
    bootstrap: false,
    etiqueta: `${etiquetaMes(mes)} (Llamadas, calculado en vivo)`,
    correo: null,
    chat: null,
    llamadas: {
      kpis: {
        demanda: kpis.demanda,
        gestionadas: kpis.gestionadas,
        escaladas: kpis.escaladas,
        no_contestadas: kpis.no_contestadas,
        sin_clasificar: kpis.sin_clasificar,
        pct_gestion: kpis.demanda ? +((100 * kpis.gestionadas) / kpis.demanda).toFixed(2) : 0,
        duracion_prom_seg,
      },
      por_version: porVersion,
      motivo_escalamiento,
      _nota_cubo_en_vivo: `Calculado en vivo el ${new Date().toISOString()} por lib/cubos.mjs.`,
    },
  };
}

// Meses de inicio reales de cada canal (Jesús, 05-sep-2026): Correo y Llamadas
// arrancan en julio 2026; Chat arranca en enero 2026 (todavía no procesado acá).
export const CORREO_LLAMADAS_INICIO = "2026-07-01";

function hoyISO() {
  // OJO (bug real, 05-sep-2026): mesesEnRango() trata su segundo argumento como
  // límite INCLUSIVE (cursor <= limite, con cursor = día 1 de cada mes) -- pasar
  // acá el día 1 del mes SIGUIENTE (como hacía la versión anterior de esta
  // función, hoyISO()) hacía que ese mes futuro calzara justo con el
  // límite y se colara en la lista. Confirmado en la primera corrida real:
  // generó correo-month-2026-10/llamadas-month-2026-10 vacíos (octubre ni
  // había empezado). Con la fecha de HOY (cualquier día dentro del mes en
  // curso, no el 1° del siguiente) el mes en curso sí entra pero el que viene
  // no, porque su día 1 ya es mayor a "hoy".
  return new Date().toISOString().slice(0, 10);
}

// No forzar el recálculo de un mes inestable si ya se calculó hace menos de
// esto -- evita que un backfill de varias corridas se quede dando vueltas
// re-calculando el mes en curso en vez de avanzar en los meses viejos que
// todavía faltan (mismo hallazgo que Retention documentó en su
// api/cubos-refrescar.mjs).
const REFRESCO_MINIMO_HORAS = 6;

// Punto de entrada del endpoint: recalcula lo que falte/pueda cambiar,
// respetando un presupuesto de tiempo (las funciones de Vercel tienen un
// maxDuration -- ver vercel.json). Devuelve qué se procesó y qué quedó
// pendiente para la próxima corrida.
export async function refrescarCubos({ historico, presupuestoMs = 240_000 }) {
  const meses = mesesEnRango(CORREO_LLAMADAS_INICIO, hoyISO());
  const porId = new Map(historico.map((s) => [s.id, s]));

  const tareas = []; // { canal, mes, existente }
  for (const canal of ["correo", "llamadas"]) {
    for (const mes of meses) {
      const id = `${canal}-month-${mes.id}`;
      tareas.push({ canal, mes, id, existente: porId.get(id) || null });
    }
  }

  // Prioridad: primero lo que falta del todo (backfill), después lo inestable
  // que ya existe pero puede haber cambiado, respetando el margen de
  // REFRESCO_MINIMO_HORAS para no recalcular el mismo mes en corridas
  // seguidas.
  const faltantes = tareas.filter((t) => !t.existente);
  const inestablesExistentes = tareas.filter((t) => {
    if (!t.existente) return false;
    if (mesEstable(t.mes.finExclusivo)) return false;
    const generadoHace = (Date.now() - new Date(t.existente.generado).getTime()) / 3_600_000;
    return generadoHace >= REFRESCO_MINIMO_HORAS;
  });
  const cola = [...faltantes, ...inestablesExistentes];

  const inicioCorrida = Date.now();
  const resultados = [];
  const pendientes = [];

  for (const tarea of cola) {
    if (Date.now() - inicioCorrida > presupuestoMs) {
      pendientes.push(tarea.id);
      continue;
    }
    const inicioTarea = Date.now();
    try {
      const snapshot = tarea.canal === "correo" ? await construirSnapshotCorreo(tarea.mes) : await construirSnapshotLlamadas(tarea.mes);
      const r = await guardarSnapshot(snapshot, { force: true });
      resultados.push({ id: tarea.id, ok: true, ms: Date.now() - inicioTarea, total_historico: r.total });
    } catch (e) {
      resultados.push({ id: tarea.id, ok: false, ms: Date.now() - inicioTarea, error: String(e.message ?? e) });
    }
  }

  return { resultados, pendientes, total_tareas: tareas.length, faltantes: faltantes.length, inestables: inestablesExistentes.length };
}
