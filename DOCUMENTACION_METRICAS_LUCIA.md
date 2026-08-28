# Documentación de métricas — Tablero de Lucía (CE-luciaBot)

Fuente para Correo y Chat: HubSpot Reports Dashboard `6180490` — vista `20862583` (Correo) y vista `20257473` (Chat). Fuente para Llamadas: ElevenLabs Conversational AI API, cruzada con HubSpot CRM (objeto `CALL`) únicamente para verificación.

---

## Correo

### Filtro común a todas las métricas de Correo

No hay un único filtro que se repita igual en las 7 tarjetas — cada widget tiene su propio filtro real, verificado directamente sobre el panel de HubSpot. Queda documentado completo en la columna "Filtros específicos" de cada métrica.

### Métricas

| Métrica | Propiedad(es) de HubSpot | Filtros específicos |
|---|---|---|
| Demanda | `source_type`, `createdate`, `hd_version`, `hs_pipeline`, Bandeja de entrada (objeto Conversaciones) | Fuente=Correo AND Fecha de creación > fecha AND HD-Versión=[país] AND Pipeline=[pipeline del país] AND Bandeja de entrada=Service Mail Inbox (Conversaciones) |
| Gestionados | `hubspot_owner_id`, `source_type`, `createdate` | Propietario del ticket = Lucía Pérez (`89503870`) AND Fuente=Correo AND Fecha de creación > fecha |
| Escalados | `escalamiento_lucia_email`, `createdate` | El valor "Escalamiento Lucia Email" es conocido AND Fecha de creación > fecha |
| % Gestión | `source_type`, `createdate`, `hs_pipeline`, `hd_version`, Bandeja de entrada (Conversaciones) | Fecha de creación > fecha AND Fuente=Correo AND Pipeline=[pipeline del país] AND Bandeja de entrada=Service Mail Inbox (Conversaciones) AND HD-Versión=[país] — mismo filtro que Demanda, sin Propietario |
| Gestión de Lucía por stage | `hubspot_owner_id`, `source_type`, `hs_pipeline_stage` | Propietario del ticket = Lucía Pérez AND Fuente = Correo |
| Escaladas vs. Gestionadas por semana ("Gestión") | `createdate`, `source_type`, `categoria_bot_lucia` | Fecha de creación > fecha AND Fuente=Correo AND el valor "Categoría bot Lucía" es conocido |
| CSAT ("CSAT - Lucía -") | `hubspot_owner_id`, Nombre de la encuesta (objeto Respuestas a encuesta) | Propietario del ticket = Lucía Pérez AND Nombre de la encuesta = "Encuesta encendida para tickets CS - Sales" |

---

## Chat

### Filtro común a todas las métricas de Chat

Hay dos patrones. Se aplica el Patrón A solo a Demanda; el Patrón B al resto, salvo que la columna "Filtros específicos" de una métrica indique un filtro de "ownership" distinto.

**Patrón A — Demanda:**
```
Bandeja de entrada IN [lista de bandejas]
AND Fuente = Live chat
AND Asignado a bot = Falso
AND Fecha de creación BETWEEN [inicio] AND [fin]
AND URL de la fuente contiene [colombia, costaRica, mexico, republicaDominicana, venezuela]
AND URL de la fuente contiene [alegra-web, alegra-pos, alegra-ne, contador, alegra-invoicing]
```

**Patrón B — el resto de las tarjetas:**
```
Bandeja de entrada IN [...]   -- lista larga en tarjetas transversales, puntual en tarjetas por país/producto
AND Fuente = Live chat
AND Flujo de chat IN [...]    -- se mueve junto con Bandeja, mismo criterio
AND Fecha de creación BETWEEN [inicio] AND [fin]
```

Owner IDs: Lucía Pérez = `89503870`, Isabel = `76066940`.

### Métricas

| Métrica | Propiedad(es) de HubSpot | Filtros específicos |
|---|---|---|
| Demanda | `inboxId`, `source`, `createdAt`, URL de la fuente | Patrón A completo — no usa `chatflowId` |
| Ingresados al bot | `inboxId`, `source`, `chatflowId`, `createdAt`, `assignedToBot` | Patrón B + Asignado a bot = Falso |
| Escalados | `inboxId`, `source`, `chatflowId`, Propietario del hilo, `createdAt` | Patrón B + Propietario NO es ninguno de (Isabel, Lucía Pérez) — sin filtro de "Asignado a bot" |
| Gestionados | `inboxId`, `source`, `chatflowId`, Propietario del hilo, `assignedToBot`, `createdAt` | Patrón B + Propietario IN (Isabel, Lucía Pérez) + Asignado a bot = Falso |
| % Gestión | Igual a Ingresados al bot | Patrón B + Asignado a bot = Falso |
| CSAT gestionado por bot | Nombre de la encuesta (objeto Respuestas a encuesta), `inboxId`, diferencia de días, Propietario, `source`, `assignedToBot`, `chatflowId`, `createdAt` | Encuesta IN [4 encuestas "Encuesta directa chat ..."] + Patrón B + diferencia de días<14 + Propietario IN (Isabel, Lucía Pérez) + Asignado a bot=Falso |
| Ingresados a Lucía por versión | `inboxId`, `source`, `chatflowId`, `assignedToBot`, `createdAt` (agrupado por país en el gráfico: VEN, CRI, MEX, DOM, COL) | Patrón B + Asignado a bot = Falso |
| Tiempo promedio de solución | `inboxId`, `source`, `chatflowId`, Propietario del hilo, tiempo de cierre (Conversations Analytics), `createdAt` | Patrón B + Asignado a bot = Falso + Propietario = Lucía Pérez únicamente (no Isabel) |
| Motivos de solicitud — COL AC | `ce_lever3` (Ticket asociado) | Bandeja=`COL-chat_sup` + Flujo de chat=`Lucía AI COL AC Prod` + Fuente=Live chat + Fecha + Asignado a bot=Falso + "Motivo de solicitud - CE" conocido |
| Motivos de solicitud — Payments | `solicitud_para_payment` (Ticket asociado) | Patrón B con lista larga completa de bandejas y flujos (no se acota a un producto) + Asignado a bot=Falso + "Solicitud para Payments" conocido |
| Motivos de solicitud — Countries AC | `funcionalidad_de_ticket` (Ticket asociado) | Bandeja=`AC-chat_sup` + Flujo de chat=`Lucía AI \| AC+SF \| CRI,MEX,DOM,VEN 100% \| Prod` + Fuente=Live chat + Fecha + Asignado a bot=Falso + "Motivo de solicitud - Countries" conocido |
| Motivos de solicitud — Contador | `motivo_de_solicitud_contador` (Ticket asociado) | Bandeja=`Contador-chat_Sup o AC-chat_sup` + Flujo de chat=`Lucía AI \| CONTADOR \| Prod` + Fuente=Live chat + Fecha + Asignado a bot=Falso + "Motivo de solicitud Contador" conocido |
| Motivos de solicitud — POS | `motivo_de_consulta_ticket_pos` (Ticket asociado) | Bandeja=`POS-chat_sup` + Flujo de chat=`Lucía AI POS \| COL,DOM 100% \| Prod` + Fuente=Live chat + Fecha + Asignado a bot=Falso + "Motivo de consulta ticket POS" conocido |
| Motivos de solicitud — NE | `propiedades_ne` (Ticket asociado) — el panel muestra la propiedad como "Motivo de solicitud NE - Tickets" | Bandeja=`Nómina-chat_Sup` + Flujo de chat=`Lucía AI NE \| COL,DOM 100% \| Prod` + Fuente=Live chat + Fecha + Asignado a bot=Falso + "Motivo de solicitud NE - Tickets" conocido |
| Embudo de gestión (diagrama) | Derivado de Demanda, Ingresados al bot, Gestionados y Escalados | Sin filtro propio — es una visualización de las 4 métricas ya mapeadas |

---

## Llamadas

### Filtro común a todas las métricas de Llamadas

```sql
bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')
AND hs_createdate BETWEEN [inicio] AND [fin]
```

Fuente de la verdad: ElevenLabs Conversational AI API (`agent_id` por bot en `elevenlabs_config.json`). Se cruza con HubSpot CRM, objeto `CALL`, únicamente para verificación.

### Métricas

| Métrica | Propiedad(es) | Filtros específicos |
|---|---|---|
| Demanda | `hs_createdate` | Ninguno adicional |
| Gestionadas | `estado_llamada` | `LOWER(estado_llamada) IN ('soporte correcto', 'seporte correcto')` |
| Escaladas a humano | `estado_llamada` | `LOWER(estado_llamada) LIKE 'escalamiento%'` OR `LIKE 'transferencia por%'` OR `= 'escalation to human support'` |
| No contestadas | `estado_llamada` | `LOWER(estado_llamada) IN ('no respuesta', 'se cuelga la llamada', 'usuario colgó', 'usuario colgo')` |
| Duración promedio | `hs_call_duration` | Ninguno adicional |
| Por versión (COL / DOM / Fuera de horario) | `bot_calificador` | Agrupado por `bot_calificador` |
| Motivo de escalamiento | `estado_llamada` (texto tras "escalamiento por" / "transferencia por", normalizado) | Solo llamadas ya clasificadas como Escaladas |
| % Completadas sin error técnico | ElevenLabs: `call_successful` | `agent_id` IN [agentes de Lucía] |
| Duración (cruce ElevenLabs) | ElevenLabs: `call_duration_secs` | `agent_id` IN [agentes de Lucía] |

---

## SQL y fórmula por métrica

### CORREO

#### Demanda
```sql
SELECT COUNT(*) AS demanda
FROM TICKET
WHERE source_type = 'EMAIL'
  AND hs_pipeline <> '1860940'
  AND hs_all_associated_contact_emails <> 'mailer-daemon@amazonses.com'
  AND createdate BETWEEN :inicio AND :fin;
```
`Demanda = COUNT(tickets)`

#### Gestionados
```sql
SELECT COUNT(*) AS gestionados
FROM TICKET
WHERE hubspot_owner_id = '89503870'
  AND source_type = 'EMAIL'
  AND hs_pipeline <> '1860940'
  AND hs_all_associated_contact_emails <> 'mailer-daemon@amazonses.com'
  AND createdate BETWEEN :inicio AND :fin;
```
`Gestionados (%) = (gestionados ÷ Demanda) × 100`

#### Escalados
```sql
SELECT COUNT(*) AS escalados
FROM TICKET
WHERE escalamiento_lucia_email IS NOT NULL
  AND hs_pipeline <> '1860940'
  AND hs_all_associated_contact_emails <> 'mailer-daemon@amazonses.com'
  AND createdate BETWEEN :inicio AND :fin;
```
`Escalados (%) = (escalados ÷ Demanda) × 100`

#### CSAT (Promotor / Neutro / Detractor)
```sql
SELECT clasificacion_encuesta_ces_csat, COUNT(*) AS total
FROM TICKET
WHERE source_type = 'EMAIL'
  AND clasificacion_encuesta_ces_csat IS NOT NULL
  AND createdate BETWEEN :inicio AND :fin
GROUP BY clasificacion_encuesta_ces_csat;
```
`CSAT (Promotores) % = Promoter ÷ (Promoter + Neutro + Detractor) × 100`

#### Gestión de Lucía por stage
```sql
SELECT hs_pipeline, hs_pipeline_stage, COUNT(*) AS conteo
FROM TICKET
WHERE hubspot_owner_id = '89503870'
  AND source_type = 'EMAIL'
  AND hs_pipeline <> '1860940'
  AND createdate BETWEEN :inicio AND :fin
GROUP BY hs_pipeline, hs_pipeline_stage;
```
`% stage = conteo(stage) ÷ Demanda del periodo × 100`

#### Escaladas vs. Gestionadas por semana
```sql
SELECT DATE_TRUNC('week', createdate) AS semana,
  COUNT(*) FILTER (WHERE hubspot_owner_id = '89503870') AS gestionadas,
  COUNT(*) FILTER (WHERE escalamiento_lucia_email IS NOT NULL) AS escaladas
FROM TICKET
WHERE source_type = 'EMAIL' AND hs_pipeline <> '1860940'
  AND createdate BETWEEN :inicio AND :fin
GROUP BY 1 ORDER BY 1;
```
`% gestión (semana) = gestionadas ÷ (gestionadas + escaladas) × 100`

---

### CHAT

#### Demanda
```
GET /conversations/v3/conversations/threads
  filtro: inboxId IN [bandejas chat_sup], source = LIVE_CHAT,
          source_url CONTAINS [país] AND source_url CONTAINS [producto],
          createdAt BETWEEN :inicio AND :fin
```
`Demanda = COUNT(conversaciones)`

#### Ingresados al bot
```
GET /conversations/v3/conversations/threads
  filtro: source = LIVE_CHAT, chatflowId IN [flujos "Lucía AI ..."],
          createdAt BETWEEN :inicio AND :fin
```
`Ingresados al bot = COUNT(conversaciones con flujo Lucía disparado)`

#### Escalados
```
GET /conversations/v3/conversations/threads
  filtro: igual a Demanda + propiedad de traspaso a agente humano = verdadero
```
`Escalados (%) = (escalados ÷ Ingresados al bot) × 100`

#### Gestionados
```
GET /conversations/v3/conversations/threads
  filtro: igual a Demanda + owner IN ('89503870', '76066940') + assignedToBot = false
```
`Gestionados (%) = (gestionados ÷ Ingresados al bot) × 100`

#### CSAT gestionado por bot
```
GET /crm/v3/objects/feedback_submissions/search
  filtro: nombre de encuesta IN [...], propietario IN ('89503870', '76066940'),
          diferencia de días entre encuesta y cierre < 14
  -- cruzado por conversationId con el resultado de threads
```
`CSAT gestionado por bot (%) = respuestas positivas ÷ total respuestas × 100`

#### Ingresados a Lucía por versión
```
GET /conversations/v3/conversations/threads
  filtro: igual a Demanda
  -- agrupar client-side por inboxId/chatflowId → país (tabla de mapeo fija)
```
`Ingresados(país) = COUNT(conversaciones) AGRUPADO POR país`

#### Motivos de solicitud — COL AC
```sql
SELECT ce_lever3, COUNT(*) AS conteo
FROM TICKET
WHERE hs_pipeline = '125444762' AND ce_lever3 IS NOT NULL
  AND createdate BETWEEN :inicio AND :fin
GROUP BY ce_lever3;
-- el TICKET se toma del asociado a cada conversación resultante del filtro común de Chat
```
`% motivo = conteo(motivo) ÷ total de motivos capturados en el periodo × 100`

#### Motivos de solicitud — Payments
```sql
SELECT solicitud_para_payment, COUNT(*) AS conteo
FROM TICKET
WHERE hs_pipeline = '125444762' AND solicitud_para_payment IS NOT NULL
  AND createdate BETWEEN :inicio AND :fin
GROUP BY solicitud_para_payment;
```
`% motivo = conteo(motivo) ÷ total de motivos capturados en el periodo × 100`

#### Motivos de solicitud — Countries AC
```sql
SELECT funcionalidad_de_ticket, COUNT(*) AS conteo
FROM TICKET
WHERE hs_pipeline = '125444762' AND funcionalidad_de_ticket IS NOT NULL
  AND createdate BETWEEN :inicio AND :fin
GROUP BY funcionalidad_de_ticket;
```
`% motivo = conteo(motivo) ÷ total de motivos capturados en el periodo × 100`

#### Motivos de solicitud — Contador
```sql
SELECT motivo_de_solicitud_contador, COUNT(*) AS conteo
FROM TICKET
WHERE hs_pipeline = '125444762' AND motivo_de_solicitud_contador IS NOT NULL
  AND createdate BETWEEN :inicio AND :fin
GROUP BY motivo_de_solicitud_contador;
```
`% motivo = conteo(motivo) ÷ total de motivos capturados en el periodo × 100`

#### Motivos de solicitud — POS
```sql
SELECT motivo_de_consulta_ticket_pos, COUNT(*) AS conteo
FROM TICKET
WHERE hs_pipeline = '125444762' AND motivo_de_consulta_ticket_pos IS NOT NULL
  AND createdate BETWEEN :inicio AND :fin
GROUP BY motivo_de_consulta_ticket_pos;
```
`% motivo = conteo(motivo) ÷ total de motivos capturados en el periodo × 100`

#### Motivos de solicitud — NE
```sql
SELECT propiedades_ne, COUNT(*) AS conteo
FROM TICKET
WHERE hs_pipeline = '125444762' AND propiedades_ne IS NOT NULL
  AND createdate BETWEEN :inicio AND :fin
GROUP BY propiedades_ne;
```
`% motivo = conteo(motivo) ÷ total de motivos capturados en el periodo × 100`

#### Tiempo promedio de solución
```
Conversations Analytics API — métrica de tiempo de cierre
  filtro: igual al filtro común de Chat
```
`Tiempo promedio de solución = AVG(tiempo de cierre) en minutos`

#### Embudo de gestión (diagrama)
Sin query propia. Se construye con los 4 valores ya obtenidos arriba:
`Tasa de contención = Gestionados ÷ Ingresados al bot`
`% no ingresaron al flujo = (Demanda − Ingresados al bot) ÷ Demanda`

---

### LLAMADAS

#### Demanda
```sql
SELECT COUNT(*) AS demanda
FROM CALL
WHERE bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')
  AND hs_createdate BETWEEN :inicio AND :fin;
```
`Demanda = COUNT(llamadas)`

#### Gestionadas
```sql
SELECT COUNT(*) AS gestionadas
FROM CALL
WHERE bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')
  AND LOWER(estado_llamada) IN ('soporte correcto', 'seporte correcto')
  AND hs_createdate BETWEEN :inicio AND :fin;
```
`Gestionadas (%) = (gestionadas ÷ Demanda) × 100`

#### Escaladas a humano
```sql
SELECT COUNT(*) AS escaladas
FROM CALL
WHERE bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')
  AND (LOWER(estado_llamada) LIKE 'escalamiento%'
       OR LOWER(estado_llamada) LIKE 'transferencia por%'
       OR LOWER(estado_llamada) = 'escalation to human support')
  AND hs_createdate BETWEEN :inicio AND :fin;
```
`Escaladas (%) = (escaladas ÷ Demanda) × 100`

#### No contestadas
```sql
SELECT COUNT(*) AS no_contestadas
FROM CALL
WHERE bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')
  AND LOWER(estado_llamada) IN ('no respuesta', 'se cuelga la llamada', 'usuario colgó', 'usuario colgo')
  AND hs_createdate BETWEEN :inicio AND :fin;
```
`No contestadas (%) = (no_contestadas ÷ Demanda) × 100`

#### Duración promedio
```sql
SELECT AVG(hs_call_duration) / 1000.0 AS duracion_prom_seg
FROM CALL
WHERE bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')
  AND hs_createdate BETWEEN :inicio AND :fin;
```
`Duración promedio (seg) = AVG(hs_call_duration) ÷ 1000`

#### Por versión (COL / DOM / Fuera de horario)
```sql
SELECT bot_calificador,
  COUNT(*) AS demanda,
  SUM(CASE WHEN LOWER(estado_llamada) IN ('soporte correcto', 'seporte correcto') THEN 1 ELSE 0 END) AS gestionadas,
  AVG(hs_call_duration) / 1000.0 AS duracion_prom_seg
FROM CALL
WHERE hs_createdate BETWEEN :inicio AND :fin
GROUP BY bot_calificador;
```
`% gestión (versión) = gestionadas ÷ demanda × 100`

#### Motivo de escalamiento
```sql
SELECT estado_llamada, COUNT(*) AS conteo
FROM CALL
WHERE bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')
  AND (LOWER(estado_llamada) LIKE 'escalamiento%' OR LOWER(estado_llamada) LIKE 'transferencia por%')
  AND hs_createdate BETWEEN :inicio AND :fin
GROUP BY estado_llamada;
-- el motivo (Petición del usuario / Desconocimiento / Falta de acceso / Error de cobro)
-- se extrae del texto tras "por" y se normaliza en el script de fetch
```
`% motivo = conteo(motivo) ÷ total de escalamientos con motivo capturado × 100`

#### % Completadas sin error técnico (ElevenLabs)
```
GET /v1/convai/conversations
  ?agent_id=[agente]&call_start_after_unix=:inicio&call_start_before_unix=:fin
```
`% completadas sin error técnico = COUNT(call_successful = 'success') ÷ COUNT(*) × 100`

#### Duración (cruce ElevenLabs)
```
GET /v1/convai/conversations
  ?agent_id=[agente]&call_start_after_unix=:inicio&call_start_before_unix=:fin
```
`Duración promedio (ElevenLabs) = AVG(call_duration_secs)`

---

## Notas de construcción

- Correo: 7 métricas de dashboard, cada una con su propio filtro real de HubSpot (no hay un filtro común único). Un octavo widget del panel, "Correos que gestiona lucía por estado", no está en el dashboard — es la misma información de "Gestión de Lucía por stage" desglosada por semana.
- Correo — Demanda y % Gestión dependen del filtro nativo "Bandeja de entrada = Service Mail Inbox" del objeto Conversaciones, sin equivalente en Tickets.
- Correo — Gestionados y Escalados: las cifras nativas de HubSpot incluyen la pipeline "Correos que no requieren respuesta" (`hs_pipeline = '1860940'`, notificaciones automáticas); la automatización la excluye aparte, junto con bounces de `mailer-daemon@amazonses.com` (comparación exacta).
- Chat: 14 de los 21 widgets del panel de HubSpot están confirmados y cubren el 100% de lo que hoy está en el dashboard. Los 7 widgets restantes del panel (posiciones 7, 9-14) no corresponden a ninguna métrica del dashboard actual.
- Chat — la lista de "Bandeja de entrada" no es idéntica entre todas las tarjetas: Demanda incluye una bandeja adicional ("Fundaciones") y Tiempo promedio de solución trae dos bandejas extra ("Fundaciones" y "Claro-chat_sup") que no aparecen en la lista estándar del resto — pendiente de confirmar con el administrador del panel (Estefanía) si son intencionales.
- Chat — Embudo de gestión: su definición como visualización derivada (sin filtro propio) viene de una revisión anterior a la captura de este panel, no de un panel de filtros propio verificado.
- Llamadas: sin cambios — ya automatizado en producción con las consultas documentadas.
