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

## Chat (Conversations) — KPIs principales

**Filtro base:** bandejas COL-chat_sup, AC-chat_sup, Contador-chat_Sup, Nómina-chat_Sup, POS-chat_sup.

| Métrica | Fórmula técnica | Fuente / filtros específicos | Qué mide a nivel de negocio |
|---|---|---|---|
| **Demanda** | `COUNT(*)` de hilos con `createdAt` en el período, en las 5 bandejas de Lucía | HubSpot Conversations API, objeto Thread (`conversations/v3/conversations/threads`), filtrado por `inboxId`. Sin filtro de flujo, para capturar toda la demanda del canal | Todas las conversaciones que llegaron a las bandejas de Lucía, hayan entrado o no al flujo del bot. |
| **Ingresados al bot** | `COUNT(*) WHERE hs_has_first_assigned_bot_id = true`, sobre el universo de Demanda | HubSpot Conversations API, objeto Conversation session | De la demanda, cuántas conversaciones entraron al flujo automatizado de Lucía. |
| **Gestionados** | `COUNT(*) WHERE hs_conversation_session_is_bot = true`, sobre el universo de Ingresados | HubSpot Conversations API, objeto Conversation session | De lo que entró al bot, cuánto se resolvió sin que un humano tomara la conversación. |
| **Escalados** | Complemento de Gestionados dentro de Ingresados (`Ingresados − Gestionados`) | HubSpot Conversations API, objeto Conversation session (marca de traspaso a agente vía `hs_conversation_session_agent_join_time`) | De lo que entró al bot, cuánto terminó en manos de un agente humano. |
| **% Gestión / % Escalados** | `% Gestión = Gestionados / Ingresados al bot · 100`<br>`% Escalados = Escalados / Ingresados al bot · 100` | Calculado en el dashboard. Es sobre Ingresados, no sobre Demanda total (a diferencia de Correo) | Tasa de contención del bot en Chat. |
| **CSAT bot** | `% = positivas / total` sobre respuestas de encuesta asociadas a conversaciones de Lucía | HubSpot, objeto Feedback Submissions vinculado a `Conversation session` | Satisfacción del cliente con la atención de Lucía en Chat. |
| **Tiempo prom. de solución** | `AVG(hs_conversation_session_duration)` en minutos, sobre el universo de Gestionados | HubSpot Conversations API, objeto Conversation session | Qué tan rápido se resuelve una conversación gestionada por Lucía. |
| **Ingresados por versión (país)** | Desglose de Ingresados agrupado por país del contacto asociado | HubSpot, cruce Conversation session + Contact | En qué países está entrando la demanda al bot, para ver el avance del rollout. |

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

## Principios generales aplicados a los tres canales

1. **Comparabilidad de universo**: el numerador (Gestionados/Escalados) siempre comparte el mismo filtro
   de alcance (país, pipeline, bandeja) que el denominador (Demanda).
2. **Sin filtros circulares**: la Demanda de cada canal se define sobre el universo total del canal, no
   sobre una propiedad que solo existe después de que algo entra al bot.
3. **Sin datos inventados**: cuando un mes no trae el desglose completo de una métrica, se muestra el
   dato disponible en vez de un porcentaje sobre datos incompletos.
