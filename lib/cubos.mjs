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
// ACTUALIZADO 07-sep-2026: Chat ya entra a este archivo. El embudo de
// Ingresados/Gestionados/Escalados (chatIngresadosGestionadosEscalados en
// lib/hubspot.js) se desbloqueó con datos reales (thread real 11060016445 +
// 2000 tickets de Chats_Sup de agosto 2026, ver el comentario de esa función
// en hubspot.js). csat_bot, ingresados_por_version, tiempo_promedio_solucion_min
// y motivos_solicitud SÍ quedan sin implementar todavía a propósito (no hay
// fuente en vivo confirmada para ellos) -- se guardan en null/vacío, que
// index.html ya sabe mostrar como "no disponible" en vez de inventar un 0.

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
  chatIngresadosGestionadosEscalados,
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

// BUG REAL encontrado 07-sep-2026 (reportado por Jesús -- el tablero mostraba "Octubre
// 2026" con datos, resultaron ser los de septiembre disfrazados): acá abajo se guardaba
// `semana_fin: mes.finExclusivo`, que es el día 1 del mes SIGUIENTE (lo que sí hace falta
// para la consulta a HubSpot en dateRangeFilters, que espera un límite exclusivo). El
// problema es que index.html arma la lista de meses del selector de período mirando el
// semana_fin MÁS ALTO de todo el histórico -- con septiembre "diciendo" que llegaba hasta
// el 1-oct, el selector ofrecía octubre como opción disponible. Peor: su filtro de rango
// (`s.semana_fin >= desde && s.semana_inicio <= hasta`) hacía que el snapshot de
// septiembre CALZARA también en el rango de "Octubre 2026" (semana_fin=2026-10-01 >=
// desde=2026-10-01), mezclando los números reales de septiembre bajo la etiqueta de un
// mes que ni había empezado.
//
// La corrección: `semana_fin` tiene que ser el último día REALMENTE cubierto, nunca el
// primero del mes siguiente. Para un mes ya terminado, es su último día calendario. Para
// el mes en curso (todavía no llegó `finExclusivo`), es HOY -- que es, de hecho, hasta
// dónde alcanza a haber tickets reales en HubSpot en ese momento.
function semanaFinReal(mes) {
  const finExclusivo = new Date(`${mes.finExclusivo}T00:00:00.000Z`);
  if (finExclusivo > new Date()) {
    return new Date().toISOString().slice(0, 10); // mes en curso: el corte real es hoy
  }
  const ultimoDia = new Date(finExclusivo.getTime() - 24 * 3_600_000);
  return ultimoDia.toISOString().slice(0, 10);
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
    semana_fin: semanaFinReal(mes),
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
    semana_fin: semanaFinReal(mes),
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

async function construirSnapshotChat(mes) {
  const { inicio, finExclusivo } = mes;
  const { ingresados, gestionados, escalados } = await chatIngresadosGestionadosEscalados(inicio, finExclusivo);
  // ingresados_bot = gestionados + escalados: mismo criterio de aproximación que ya usaba
  // el snapshot manual de Breeze ("verificación cruzada Escaladas+Gestionadas ≈ Ingresados
  // al bot"). `demanda` (ingresados a la pipeline Chats_Sup) es un universo más amplio que
  // incluye tickets nunca tocados por Lucía (otros owners) -- ver nota abajo.
  const ingresados_bot = gestionados + escalados;
  return {
    id: `chat-month-${mes.id}`,
    semana_inicio: inicio,
    semana_fin: semanaFinReal(mes),
    generado: new Date().toISOString().slice(0, 10),
    bootstrap: false,
    etiqueta: `${etiquetaMes(mes)} (Chat, calculado en vivo)`,
    correo: null,
    llamadas: null,
    chat: {
      kpis: {
        demanda: ingresados,
        ingresados_bot,
        gestionados,
        escalados,
        csat_bot: null,
      },
      ingresados_por_version: [],
      tiempo_promedio_solucion_min: null,
      motivos_solicitud: {},
      _nota_cubo_en_vivo: `Calculado en vivo el ${new Date().toISOString()} por lib/cubos.mjs. demanda = tickets creados en la pipeline Chats_Sup (125444762) en el período. gestionados = de esos, hubspot_owner_id=89503870 (Lucía) -- validado 07-sep-2026: coincide al 100% (1105/1105) con categoria_bot_lucia=gestionadas sobre una muestra real de 2000 tickets de agosto. escalados = de esos, inbox_id_objetivo con valor (propiedad real "Escalamiento inbox objetivo", única señal de escalado poblada de forma no trivial en Chat -- chat_transferido y escalamiento_lucia_email salieron vacíos). ingresados_bot = gestionados+escalados (aproximación). csat_bot, ingresados_por_version, tiempo_promedio_solucion_min y motivos_solicitud NO están implementados en vivo todavía -- se dejan null/vacíos a propósito (no inventar un número sin fuente confirmada), index.html los muestra como "no disponible".`,
    },
  };
}

// Meses de inicio reales de cada canal (Jesús, 05-sep-2026 y 07-sep-2026): Correo y
// Llamadas arrancan en julio 2026; Chat arranca en febrero 2026 (enero se deja afuera a
// propósito -- el bot todavía no estaba activo, Ingresados/Escalados/Gestionados/CSAT
// daban todos 0 y eso confundía más de lo que aportaba, mismo criterio que ya se usó al
// limitar el snapshot manual chat-month-2026-01).
export const CORREO_LLAMADAS_INICIO = "2026-07-01";
export const CHAT_INICIO = "2026-02-01";

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
// Cada canal tiene su propio mes de arranque (Correo/Llamadas: julio 2026, Chat: febrero
// 2026) -- por eso mesesEnRango() se llama una vez por canal, no una sola vez para todos.
const CANALES = [
  { canal: "correo", inicio: CORREO_LLAMADAS_INICIO, construir: construirSnapshotCorreo },
  { canal: "llamadas", inicio: CORREO_LLAMADAS_INICIO, construir: construirSnapshotLlamadas },
  { canal: "chat", inicio: CHAT_INICIO, construir: construirSnapshotChat },
];

export async function refrescarCubos({ historico, presupuestoMs = 240_000 }) {
  const hoy = hoyISO();
  const porId = new Map(historico.map((s) => [s.id, s]));

  const tareas = []; // { canal, mes, existente, construir }
  for (const { canal, inicio, construir } of CANALES) {
    const meses = mesesEnRango(inicio, hoy);
    for (const mes of meses) {
      const id = `${canal}-month-${mes.id}`;
      tareas.push({ canal, mes, id, construir, existente: porId.get(id) || null });
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
      const snapshot = await tarea.construir(tarea.mes);
      const r = await guardarSnapshot(snapshot, { force: true });
      resultados.push({ id: tarea.id, ok: true, ms: Date.now() - inicioTarea, total_historico: r.total });
    } catch (e) {
      resultados.push({ id: tarea.id, ok: false, ms: Date.now() - inicioTarea, error: String(e.message ?? e) });
    }
  }

  return { resultados, pendientes, total_tareas: tareas.length, faltantes: faltantes.length, inestables: inestablesExistentes.length };
}
