# Contexto del proyecto — Dashboard Lucía (Correo / Chat / Llamadas)

Actualizado: 28-ago-2026. Este documento resume cómo está armado el dashboard hoy: de dónde sale cada
métrica, qué filtros exactos se usaron en HubSpot para sacarla, qué limitaciones conocidas tiene cada
canal, y qué queda pendiente. Es un complemento a `DOCUMENTACION_METRICAS_LUCIA.md` (que tiene detalles
más viejos y algunos con bugs conocidos sin corregir) — este archivo refleja el estado real del código
y los datos tal como quedaron después de la sesión del 28-ago-2026.

---

## 1. Arquitectura general

- **`index.html`**: dashboard estático de una sola página (sin backend, sin build step). Todo el HTML,
  CSS y JS vive en este archivo. Usa Chart.js (CDN) para las gráficas.
- **`lucia_dashboard_history.json`** / **`lucia_dashboard_history.js`**: la fuente de datos. El `.js` es
  el mismo JSON envuelto en `window.LUCIA_HISTORY = {...};` (así el navegador lo puede cargar con un
  `<script src>` normal sin CORS ni fetch). **Los dos archivos deben regenerarse juntos siempre** — nunca
  editar uno sin el otro.
- Estructura del JSON: `{ meta: {...}, snapshots: [...] }`. Cada snapshot es un período (`semana_inicio`,
  `semana_fin`, `id`, `etiqueta`) con hasta 3 sub-objetos: `correo`, `chat`, `llamadas` — cada uno `null`
  si ese snapshot no trae datos de ese canal (para no duplicar si los rangos de fecha se solapan).
- **Migración a mensual (28-ago-2026)**: los tres canales pasaron de snapshots semanales a **snapshots
  mensuales no solapados** (`correo-month-2026-01` a `-08`, mismo patrón para `chat-` y `llamadas-`).
  Los snapshots viejos semanales/bootstrap que cubrían jul-ago se vaciaron (`correo: null`, etc.) para
  no sumar dos veces el mismo período.
- **Filtro de período (PERÍODO) en el dashboard**: sencillamente suma los snapshots cuyo rango se cruza
  con el rango elegido (`HISTORY.filter(s => s[dataKey] && s.semana_fin >= desde && s.semana_inicio <= hasta)`).
  Por defecto abre mostrando **el último mes disponible** (antes mostraba el año completo; se cambió a
  pedido de Jesus el 28-ago-2026).
- **Rango de fechas disponible en el filtro, limitado por canal** (nulling deliberado de meses sin
  actividad real, no borrado — se puede reactivar quitando el campo `_nota_*_limitado_28ago2026` y
  restaurando el sub-objeto):
  - **Correo**: arranca en **junio 2026** (ene-may tenían gestión ~0, confundía).
  - **Chat**: arranca en **febrero 2026** (enero tenía demanda pero cero actividad real del bot).
  - **Llamadas**: sin limitar, corre desde el primer snapshot disponible.
- **Verificación**: cada cambio a `index.html` se valida con `node --check` sobre el `<script>` extraído
  y con una carga headless en Playwright (Chromium en `/opt/pw-browsers/chromium`) que revisa que no haya
  `pageerror` y lee los valores realmente renderizados — no solo revisión visual del código.

---

## 2. Navegación y vistas

Orden del menú lateral (cambiado el 28-ago-2026, antes era Correo/Chat/Llamadas): **Chat → Correo →
Llamadas**. Chat es la vista activa por defecto al cargar.

---

## 3. Lucía Correo

**Fuente de datos**: HubSpot, objeto TICKET, vía API directa (HubSpot MCP) — no depende del copiloto de
IA de HubSpot para Demanda/Gestionados/Escalados/CSAT (solo Tiempo prom. de gestión se sacó vía HubSpot
AI/Breeze).

**Alcance real: SOLO Colombia.** No son los 5 países, es importante no asumir que el número actual ya
suma todo — si se agregan otros países hay que replicar la misma consulta con su propio Pipeline/HD-Version.

### KPIs (tarjetas superiores)
| KPI | Fórmula / filtro exacto |
|---|---|
| **Demanda** | Informe nativo de HubSpot "Demanda" (clonado, validado contra el panel real — 702 tickets en su ventana original). Filtros: `Fuente=Correo`, `HD-Version=Colombia`, `Pipeline=1857341 (COL_Sup)`, `Bandeja de entrada=Service Mail Inbox (Conversations)`. |
| **Gestionados** | `TICKET WHERE hubspot_owner_id = 89503870 (Lucía Pérez) AND source_type=EMAIL AND hs_pipeline<>1860940`, excluyendo bounces `mailer-daemon`. Vía API directa. |
| **Escalados** | `TICKET WHERE escalamiento_lucia_email IS NOT NULL`, mismas exclusiones. Vía API directa. |
| **Tiempo prom. de gestión** *(agregado 28-ago-2026, reemplaza al CSAT que se quitó)* | `AVG(TIME_TO_CLOSE)/60000` (ms→min), objeto Tickets, `Propietario=Lucía Pérez`, `Fuente=Email`, tiempo de cierre informado, agrupado mensual, vía HubSpot AI. Ene-abr sin registros con tiempo de cierre. Valores cargados: jun=3.318 min, **jul=9.484 min (dato atípicamente alto — vale la pena confirmarlo, ver sección 7)**, ago=2.068 min. |

### CSAT — **eliminado del dashboard el 28-ago-2026**
Se investigó porque la muestra era mínima (7 respuestas totales vía filtro por propietario). Se
verificó con una consulta independiente por la propiedad "Categoría bot Lucía" = "gestionadas"
(6 respuestas) — confirmó que la muestra chica es real, no un bug de filtro. Con una muestra tan
pequeña se decidió quitar la tarjeta y el gráfico de CSAT de Correo en vez de seguir mostrando un
100% no representativo. El campo `csat_detalle`/`csatMensual` sigue existiendo en el JSON y en
`aggregateCorreo()` por si se quiere reactivar en el futuro con más datos.

### Embudo de gestión (`renderCorreoFlow`)
Correo **no tiene** un dato nativo de "ingresados al flujo" como sí tiene Chat. Se deriva:
`Ingresados al Flujo = Gestionados + Escalados`, `No Ingresaron al Flujo = Demanda − Ingresados`.
Estructura idéntica a la de Chat (mismo componente visual, 2 niveles) — se rehizo así el 28-ago-2026 a
pedido explícito de Jesus ("ponle No ingresaron al flujo y hazlo como el de chat").

### "Gestionados por versión (país)" — **quitado el 28-ago-2026**
Se intentó agregar un gráfico igual al de Chat, pero HubSpot AI no pudo desglosar Gestionados por país
para Correo con el nivel de detalle necesario (solo se consiguió Colombia/RD combinados en una tabla
simple, no un desglose limpio por país-mes comparable al resto del dashboard). Se decidió quitar el
gráfico por ahora en vez de dejarlo vacío o con datos parciales confusos. El campo
`gestionados_por_version` sigue en `aggregateCorreo()` (vacío) por si se retoma más adelante.

### Cards/gráficos quitados antes (no tenían datos en los snapshots mensuales nuevos)
"Escaladas vs. Gestionadas por semana" y "Gestión de Lucía por stage" — dependían de campos
(`tendencia_semanal`, `por_stage`) que solo existían en snapshots semanales viejos, nunca en los
mensuales nuevos.

---

## 4. Lucía Chat

**Fuente de datos**: HubSpot Conversations, pero **la Conversations API está bloqueada** (Private App sin
ese scope) — todos los números (excepto Tiempo prom. de solución) se generaron vía **HubSpot AI/Breeze**
(el copiloto dentro de la UI de HubSpot), no vía API directa. Esto significa que cada mes tuvo que
pedirse manualmente con un prompt específico.

### KPIs
| KPI | Filtro exacto (validado 28-ago-2026) |
|---|---|
| **Demanda** | `Bandeja` = SOLO las 5 bandejas relevantes de Lucía (COL-chat_sup, AC-chat_sup, Contador-chat_Sup, Nomina-chat_Sup, POS-chat_sup), **sin filtro de Flujo**. Captura todo lo que llegó a esas bandejas, haya o no entrado al bot. |
| **Ingresados al bot / Escalados / Gestionados** | `Fuente=Live chat`, `Flujo de chat` = lista cerrada de 5 flujos de producción de Lucía (excluye Testing/Demo/Sales), `Propietario=Isabel o Lucía Pérez`, `Asignado a bot=Falso` (para Gestionados/Escalados), rango de fecha mensual. |
| **CSAT** | Solo cubre Contador/POS/Nómina — COL y AC/Countries no registran respuestas de encuesta en este canal. No reportar como CSAT total de Chat. |
| **Tiempo prom. de solución** | Solo `Propietario=Lucía Pérez` (excluye Isabel). |

**Ojo con "Demanda" — historial de la corrección (importante si se vuelve a tocar):**
1. Versión original: filtraba por ~20 bandejas de chat de toda la empresa (incluía Payments chat,
   bandejas archivadas de otros países) → no comparable con Ingresados/Escalados/Gestionados.
2. Primer intento de corrección: se agregó el mismo filtro de `Flujo` que usa Ingresados → dio un
   número **idéntico** a Ingresados al bot. Esto es **circular**: una conversación no tiene `Flujo`
   asignado hasta que ya entró al bot, así que filtrar Demanda por Flujo mide lo mismo que Ingresados,
   no la demanda total.
3. Corrección final (la que quedó aplicada): filtrar Demanda **solo por las 5 bandejas relevantes, sin
   filtro de Flujo**. Con esto la curva de % de ingreso al bot es creíble: 2.2% en feb → 80.3% en jul.

**Payments chat**: aporta a Demanda pero su gestión por bot queda pendiente de confirmar — no se sabe si
Lucía realmente lo atiende o no.

**País MEX/DOM/CRI/VEN** cubre el flujo AC+SF; ene-may en 0 por rollout por fases (bot no activo aún).
Colombia (COL) queda pendiente de una consulta separada para el desglose "Ingresados por versión".

**Motivos de solicitud**: pendiente de backfill manual (`Backfill_Chat_Lucia.xlsx`, pestaña "Chat -
Motivos") — el usuario aún no lo ha hecho.

### Rango de fechas limitado
Enero 2026 se limitó (`chat: null`) porque tenía demanda pero cero actividad real del bot.

### Cards quitadas
"Motivos de solicitud por vertical" — sin datos reales para los snapshots mensuales.

---

## 5. Lucía Llamadas

**Fuente de datos**: HubSpot CRM, objeto **CALL**, filtrado por `bot_calificador`. A diferencia de
Correo/Chat, **nunca dependió de la Conversations API bloqueada** — siempre fue 100% vía API directa
(HubSpot MCP), por eso no necesitó el copiloto de IA para los datos base. Complementado con ElevenLabs
Conversational AI API para el cruce técnico (tarjeta "Cruce técnico — ElevenLabs" **eliminada del
dashboard el 28-ago-2026** a pedido de Jesus, aunque el campo `elevenlabs` sigue en el JSON/código).

### KPIs
`TICKET/CALL WHERE bot_calificador IN ('lucia-ivr', 'lucia-ivr-dom', 'lucia ivr fuerahorario')`,
agrupado por `DATE_TRUNC(hs_createdate, 'MONTH')`. `estado_llamada` es texto libre (no enum) — se
enumeraron las variantes reales antes de filtrar. Duración promedio en segundos, todas las versiones
juntas.

**Importante — bug corregido el 28-ago-2026**: los totales del KPI strip (Demanda/Gestionadas/
Escaladas/etc.) se leen de `l.kpis` (el agregado real por snapshot), **no** se suman desde
`l.por_version`. Antes se sumaban desde `por_version`, y como los snapshots mensuales de jul-ago solo
traen `demanda` desglosada por país (no gestionadas/escaladas), el resto quedaba en 0 aunque el dato
sí existiera a nivel total.

### "Por versión" (país) — COL / DOM
Desde el 28-ago-2026 este gráfico **solo muestra COL y DOM** (los 2 países reales). Antes incluía
"Fuera de horario" como si fuera un tercer país.

### "Fuera de horario" — separado del gráfico de países (28-ago-2026)
Se confirmó vía HubSpot (cruce `CONTACT.pais_general`) que "Fuera de horario" **no es un país**, es un
bucket de horario que se solapa con Colombia (de 524 llamadas totales, 199 confirmadas como Colombia,
325 sin país asignado). Por pedido explícito de Jesus, ahora se muestra por separado en un elemento
propio (`#llamadasFueraHorarioWrap`) debajo de la lista COL/DOM, con la nota: *"no es un país, son
llamadas recibidas fuera del horario laboral"*. Los snapshots mensuales de jul-ago solo traen `demanda`
para esta categoría (no gestionadas/escaladas desglosadas), por eso se muestra solo el número, sin %.

### Motivo de escalamiento
Property de CALL, agregada a nivel total (todas las versiones juntas) — si hay un filtro de versión
activo en el dashboard, esta sección no se muestra para no mezclar países distintos.

---

## 6. Patrón de trabajo establecido para tocar este dashboard

1. **Nunca editar solo `index.html`** sin regenerar también `lucia_dashboard_history.json` **y**
   `.js` cuando cambian datos (o viceversa).
2. Antes de sumar/mostrar un campo nuevo, revisar si ese campo realmente existe en los snapshots
   mensuales — varios bugs de "0.00%"/vacíos salieron de leer campos que solo existían en el formato
   semanal viejo.
3. Verificar siempre con `node --check` (sintaxis) + carga headless en Playwright (que realmente
   renderice, no solo que compile) antes de entregar.
4. Cuando un número de HubSpot no cuadra con otro (ej. Gestionados > Demanda, o Ingresados no coincide
   entre un reporte nativo y el dashboard), lo primero es comparar: (a) que el **rango de fecha** sea
   exactamente el mismo, (b) que los **filtros** (Bandeja, Flujo, Propietario, Asignado a bot) sean
   comparables entre las tarjetas que se están comparando — la mayoría de las "inconsistencias" que
   han salido este proyecto fueron por reportes nativos de HubSpot armados en momentos distintos con
   distinta cantidad de filtros, no por un bug real de datos.
5. Cuidado con filtros circulares: filtrar "Demanda" (que debería ser el universo total, incluyendo lo
   que nunca entró al bot) por una propiedad que solo existe *después* de que algo entra al bot (como
   `Flujo`) da un número igual a "Ingresados", no a la demanda real.

---

## 7. Pendientes / cosas a revisar

- **Correo — Tiempo prom. de gestión de julio (9.484 min ≈ 6.6 días)** llama la atención frente a
  jun (3.318 min) y ago (2.068 min) — vale la pena confirmar si es un outlier real (tickets viejos
  cerrados tarde) o algo que distorsiona el promedio (ej. un ticket con `time_to_close` absurdo).
- Correo: mismatch de filtros entre Demanda/Gestionados/Escalados en reportes nativos (detectado, no
  resuelto formalmente) — mismo patrón que se corrigió para Chat.
- Chat: confirmar si Payments chat debe contarse en Gestionados/Escalados o solo en Demanda.
- Chat: hacer la consulta separada de Colombia para completar "Ingresados por versión".
- Backfill manual de "Motivos de solicitud" de Chat (`Backfill_Chat_Lucia.xlsx`) — no iniciado.
- `DOCUMENTACION_METRICAS_LUCIA.md` tiene bugs conocidos sin corregir (enum Neutro→Passive, sección de
  SQL de Demanda desactualizada/engañosa) — señalados varias veces pero nunca editados directamente.
- Confirmar con Estefanía el estado del flujo de bot en Payments Chat y quién es "Isabel" (aparece
  como propietario alterno en los filtros de Chat).
- Push pendiente: confirmar que todos los cambios de esta sesión (28-ago-2026) ya se subieron a
  `git` (`git add -A && git commit -m "..." && git push origin main`).
