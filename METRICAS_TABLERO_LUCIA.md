# Métricas del tablero de Lucía (Correo / Chat / Llamadas)

Documento de referencia para cada métrica que muestra el tablero: cómo se calcula técnicamente (fuente,
filtros, fórmula/query) y qué mide a nivel de negocio. Todas las métricas se calculan por API directa
de HubSpot (`crm/v3/objects/...` y `conversations/v3/...`), sin intervención manual.

---

## Correo (Tickets) — KPIs principales

**Filtro base, aplicado siempre salvo que se indique lo contrario:** `Pipeline = COL_Sup (1857341)` —
alcance Colombia, `source_type = EMAIL`.

| Métrica | Fórmula técnica | Fuente / filtros específicos | Qué mide a nivel de negocio |
|---|---|---|---|
| **Demanda** | `COUNT(*)` de tickets con `createdate` en el período | HubSpot, objeto Ticket: `source_type = EMAIL`, `hs_pipeline = 1857341` | Cuánta demanda de correo llega a soporte Colombia en el período, la haya tocado Lucía o no. |
| **Gestionados** | `COUNT(*) WHERE hubspot_owner_id = 89503870 AND source_type = EMAIL AND hs_pipeline = 1857341`, agrupado por `createdate` | HubSpot, objeto Ticket. `89503870` = owner Lucía Pérez | Cuántos tickets resolvió Lucía sin que un agente humano tuviera que intervenir. |
| **Escalados** | `COUNT(*) WHERE escalamiento_lucia_email IS NOT NULL AND hs_pipeline = 1857341`, agrupado por `createdate` | HubSpot, objeto Ticket | Cuántos tickets terminó resolviendo un humano después de pasar (o no) por Lucía. |
| **% Gestión / % Escalados** | `% Gestión = Gestionados / Demanda · 100`<br>`% Escalados = Escalados / Demanda · 100` | Calculado en el dashboard | Tasa de contención del bot en Correo. |
| **Tiempo prom. de gestión** | `AVG(time_to_close)` en minutos, sobre el universo de Gestionados | HubSpot, objeto Ticket, propiedad `time_to_close` | Qué tan rápido se cierra un ticket gestionado por Lucía. Se muestra en horas, o en días si supera 72h. |

---

## Chat (Tickets) — KPIs principales

**ACTUALIZADO 07-sep-2026.** La definición anterior de esta sección (basada en hilos de la
Conversations API y en propiedades `hs_has_first_assigned_bot_id` / `hs_conversation_session_is_bot`)
quedó **descartada**: esas propiedades no están confirmadas para la API pública, y la inspección de
hilos reales de agosto 2026 (ver `diagnosticar_actores_chat2.mjs`) no encontró ningún actor de tipo
`BOT` en las conversaciones de Lucía — Lucía corre como una **integración externa** que responde a
través de un "agent seat" fijo en HubSpot (`hubspot_owner_id = 89503870`, mismo owner que en Correo),
no como un chatflow nativo. La definición vigente usa **tickets** (objeto Ticket, no Conversations),
igual que Correo y Llamadas.

**Filtro base:** `Pipeline = Chats_Sup (125444762)`.

| Métrica | Fórmula técnica | Fuente / filtros específicos | Qué mide a nivel de negocio |
|---|---|---|---|
| **Demanda** | `COUNT(*)` de tickets con `createdate` en el período, `hs_pipeline = 125444762` | HubSpot, objeto Ticket (`chatDemandaTicketsCount()`). Cubre ~99% del volumen real de `source_type = CHAT` | Todo lo que llegó a la pipeline de Chat en el período, lo haya tocado Lucía o no. |
| **Gestionados** | `COUNT(*) WHERE hubspot_owner_id = 89503870`, sobre el universo de Demanda | HubSpot, objeto Ticket. Validado 07-sep-2026: coincide al 100% (1105/1105 en una muestra real de agosto) con la propiedad `categoria_bot_lucia = "gestionadas"` | Cuántos tickets de Chat resolvió Lucía sin que un agente humano tuviera que intervenir. |
| **Escalados** | `COUNT(*) WHERE inbox_id_objetivo IS NOT NULL`, sobre el universo de Demanda | HubSpot, objeto Ticket, propiedad `inbox_id_objetivo` (label real: "Escalamiento inbox objetivo") | Cuántos tickets de Chat terminaron reasignados a un agente humano. **Señal incompleta** — ver limitación abajo. |
| **Ingresados al bot** | `Gestionados + Escalados` (aproximación) | Calculado en el dashboard | De la demanda, cuánto efectivamente pasó por Lucía (resuelto o escalado). |
| **% Gestión / % Escalados** | `% Gestión = Gestionados / Ingresados al bot · 100`<br>`% Escalados = Escalados / Ingresados al bot · 100` | Calculado en el dashboard | Tasa de contención del bot en Chat. |
| **CSAT bot / Tiempo prom. de solución / Ingresados por versión** | — | **No implementado en vivo.** Se dejan `null`/vacíos a propósito (no inventar sin fuente confirmada) | Pendiente: no hay todavía una propiedad de HubSpot confirmada para estos tres datos en Chat. |

**⚠️ Limitaciones conocidas (07-sep-2026), no resueltas:**

- **Escalados subcuenta.** Confirmado contra los números que antes calculaba HubSpot AI (Breeze) con otra
  metodología (hilos/bandejas): `inbox_id_objetivo` da resultados muy por debajo de la realidad incluso en
  agosto (104 vs. ~1.534 esperados). Es la única propiedad de ticket con una señal de escalado no trivial
  que se ha encontrado hasta ahora, pero claramente no captura todos los casos. Pendiente encontrar una
  señal mejor (candidato sin explorar: los comentarios internos que deja el bot en el hilo, tipo
  "RESUMEN DEL BOT — Caso escalado automáticamente", ver `diagnosticar_thread_real.mjs`).
- **Febrero y marzo 2026 dan Gestionados = 0 / Escalados = 0 en vivo.** No es un error de código: es lo
  que HubSpot devuelve hoy bajo esta definición. El bot (entonces llamado "Isabel", ver wiki) sí operaba y
  resolvía casos reales desde antes, pero el tracking por `hubspot_owner_id` / `inbox_id_objetivo` no
  llega tan atrás — se decidió (Jesús, 07-sep-2026) NO restaurar cifras viejas hardcodeadas y en su lugar
  quitar esos dos meses del histórico (`api/limpiar-historico`), dejando el selector de período arrancar
  en Abril 2026 para Chat. Abril y mayo sí muestran Gestionados reales, pero Escalados sigue en 0 —
  la señal de `inbox_id_objetivo` solo empieza a aparecer de forma consistente desde junio 2026.

---

## Llamadas (Calls) — KPIs principales

**Fuente de la verdad:** ElevenLabs Conversational AI API — es el sistema que ejecuta el IVR de
Lucía, así que sus registros son el dato primario de cada llamada. Se valida contra la información
espejada en HubSpot (objeto Call, sincronizado desde ElevenLabs) para confirmar consistencia entre
ambas plataformas antes de publicar cada corte.

**Filtro base:** `bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')`.

| Métrica | Fórmula técnica | Fuente / filtros específicos | Qué mide a nivel de negocio |
|---|---|---|---|
| **Demanda / Gestionadas / Escaladas / No contestadas** | `COUNT(*) WHERE bot_calificador IN (...)`, agrupado por mes de `hs_createdate`, clasificado por `estado_llamada` | HubSpot, objeto Call | Volumen total de llamadas del sistema Lucía y cómo se resolvió cada una: IVR/bot, escalada a agente, o sin respuesta. |
| **% Gestión / % Escaladas / % No contestadas** | `% X = X / Demanda · 100` | Calculado en el dashboard | Qué proporción resuelve el IVR solo, vs. cuánto escala a un humano, vs. cuánto se pierde sin contestar. |
| **Duración promedio** | Promedio ponderado por volumen mensual, en segundos | HubSpot, objeto Call, propiedad `hs_call_duration` | Cuánto dura en promedio una llamada atendida por el sistema de Lucía. |
| **Por versión (país) — COL / DOM** | Desglose de demanda, gestionadas y escaladas por `bot_calificador` de país | HubSpot, objeto Call | Compara el desempeño del IVR entre Colombia y República Dominicana. |
| **"Fuera de horario"** *(mostrado aparte)* | `COUNT(*)` de llamadas con `bot_calificador = 'lucia ivr fuerahorario'` | HubSpot, objeto Call | Llamadas recibidas fuera del horario laboral — se muestra separado del comparativo de países porque no es un tercer país, se solapa con Colombia. |
| **Motivo de escalamiento** | `COUNT(*)` agrupado por `motivo_escalamiento` | HubSpot, propiedad de Call | Por qué una llamada terminó en un agente humano en vez de resolverla el bot. |

---

## Actualización automática del tablero

El tablero (`index.html`) NO calcula nada en vivo cuando alguien lo abre — solo lee `GET /api/history`,
que lee del histórico guardado en KV (Redis). Ese histórico se actualiza solo por dos crons de Vercel
(definidos en `vercel.json`), ambos corren en horario UTC:

| Cron | Horario (UTC) | Hora Colombia | Qué hace |
|---|---|---|---|
| `/api/cubos-refrescar` | `0 11 * * 3` — **miércoles** | 6:00 a.m. | Recalcula en vivo contra HubSpot los cubos mensuales de Correo, Llamadas y Chat: crea los meses que falten y recalcula los "inestables" (el mes en curso y el anterior, mientras no hayan pasado 60 días desde que terminaron) — ver `lib/cubos.mjs`. Los meses ya "estables" (>60 días) no se tocan más. |
| `/api/cron/actualizar-semanal` | `0 11 * * 3` — **miércoles** | 6:00 a.m. | Job semanal más antiguo (Correo/Llamadas + detalle técnico de ElevenLabs para Llamadas). |

En la práctica, para Correo/Llamadas/Chat: **el mes en curso se refresca solo una vez a la semana**
(miércoles, 6 a.m. Colombia) — mismo día y hora que el tablero de Soporte. Si alguien mira el tablero
en otro momento de la semana, va a ver el mismo corte hasta el próximo miércoles — no hay actualización
en tiempo real. Para forzar un refresco fuera de horario (por ejemplo después de corregir un filtro),
se llama a mano el endpoint con el `CRON_SECRET`:

```powershell
Invoke-WebRequest -Uri "https://ce-lucia-dashboard.vercel.app/api/cubos-refrescar" -Method POST -Headers @{Authorization = "Bearer $env:CRON_SECRET"} -UseBasicParsing
```

---

## Principios generales aplicados a los tres canales

1. **Comparabilidad de universo**: el numerador (Gestionados/Escalados) siempre comparte el mismo filtro
   de alcance (país, pipeline, bandeja) que el denominador (Demanda).
2. **Sin filtros circulares**: la Demanda de cada canal se define sobre el universo total del canal, no
   sobre una propiedad que solo existe después de que algo entra al bot.
3. **Sin datos inventados**: cuando un mes no trae el desglose completo de una métrica, se muestra el
   dato disponible en vez de un porcentaje sobre datos incompletos.
