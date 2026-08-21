# Instructivo — Dashboard Lucía (Correo + Chat)

Este documento explica de dónde sale cada métrica del dashboard `index.html`, cómo se transforma, y cómo actualizarlo. La sección de **Lucía Llamadas** (ElevenLabs + Metabase) queda pendiente — se retoma en otra sesión.

## 1. Cómo funciona el dashboard

`index.html` no trae datos "quemados": cuando abre, lee un **histórico** de snapshots semanales y con eso arma los KPIs, gráficos y tablas del periodo que el usuario tenga seleccionado. El HTML nunca se toca — solo se agrega al archivo de datos.

```
index.html                       → la interfaz (no cambia salvo que se rediseñe)
lucia_dashboard_history.js       → el histórico completo que realmente carga el navegador (window.LUCIA_HISTORY = {...})
lucia_dashboard_history.json     → el mismo histórico en JSON plano (para el pipeline/API, no lo lee el navegador directo)
```

Los archivos viejos `lucia_dashboard_data.js` / `lucia_dashboard_data.json` (una sola "foto" que se sobreescribía cada vez) quedaron **obsoletos** — ya no los lee `index.html`. Se pueden borrar de la carpeta; si siguen ahí no hacen nada.

**¿Por qué dos archivos de datos?** Este dashboard se abre con doble clic desde el explorador de Windows (`file:///C:/Users/...`), y Chrome bloquea por seguridad que una página local (`file://`) haga `fetch()` de otro archivo local — falla en silencio, sin ningún error visible, y la página se queda cargando para siempre. Por eso `index.html` carga `lucia_dashboard_history.js` con una etiqueta `<script src="...">` (eso sí funciona desde `file://`), y ese archivo simplemente asigna el mismo contenido a `window.LUCIA_HISTORY`. `lucia_dashboard_history.json` se mantiene como el formato "limpio" para que el script de automatización lo genere fácil; al final del proceso ese JSON se envuelve en `window.LUCIA_HISTORY = <json>;` para producir el `.js`.

Si en algún momento este dashboard se sirve desde un servidor real (como el de Valentina, con `/api/auth/...`) en vez de abrirse con doble clic, el HTML igual funciona: si no encuentra `lucia_dashboard_history.js` intenta `fetch('./lucia_dashboard_history.json')` como respaldo.

### 1.1 Estructura del histórico

`lucia_dashboard_history.json` es un objeto con un array `snapshots`, uno por semana:

```json
{
  "meta": { "fuente_correo": "...", "fuente_chat": "...", "nota": "..." },
  "snapshots": [
    {
      "id": "boot-2026-07-01",
      "semana_inicio": "2026-07-01",
      "semana_fin": "2026-08-19",
      "generado": "2026-08-19",
      "bootstrap": true,
      "etiqueta": "01 jul – 19 ago 2026 (acumulado inicial)",
      "correo": { "kpis": {...}, "por_stage": [...], "tendencia_semanal": [...], "csat": {...} },
      "chat": { "kpis": {...}, "ingresados_por_version": [...], "motivos_solicitud": {...}, "tiempo_promedio_solucion_min": ... }
    }
  ]
}
```

El primer snapshot (`boot-2026-07-01`) es un **acumulado inicial**: cubre casi 7 semanas juntas porque así se leyó la primera vez, antes de que existiera este mecanismo de histórico. Está marcado con `"bootstrap": true` para que quede claro que no es una semana limpia. **Cada snapshot nuevo que se agregue de aquí en adelante sí debe cubrir exactamente una semana** (`semana_inicio` un lunes, `semana_fin` el domingo siguiente, por ejemplo), para que las comparaciones semana a semana y mes a mes sean correctas.

### 1.2 El dashboard nunca se sobreescribe — se le agrega

Cada vez que hay datos nuevos de HubSpot, la acción correcta es **agregar un objeto nuevo al array `snapshots`**, no reemplazar el archivo. Así el dashboard va acumulando historia real: en septiembre se podrá ver el comportamiento de agosto completo, comparar una semana contra otra, o contra el mismo periodo del mes anterior.

En el dashboard mismo, arriba de las tarjetas de KPI de cada sección (Correo / Chat) hay un selector de periodo:
- **Desde / Hasta**: eligen un rango de snapshots consecutivos, que se suman/combinan entre sí (los conteos se suman, los porcentajes se recalculan sobre los totales del rango, el CSAT y el tiempo de solución se promedian ponderados por volumen).
- **Todo el histórico** / **Última semana**: atajos rápidos.
- **Comparar con otro periodo**: activa un segundo selector Desde/Hasta; cuando está activo, cada tarjeta de KPI muestra el cambio % contra ese segundo periodo (↑ verde si el cambio es favorable para esa métrica, ↓ rojo si no — por ejemplo, más escalados es ↓ rojo aunque el número haya subido, porque más escalados es malo).

## 2. Mapeo de métricas — Lucía Correo

Fuente: HubSpot → Reports Dashboard `6180490` → vista `20862583` (tickets de Servicio al cliente, filtrados a gestión de Lucía).

| Métrica en el dash | Widget de HubSpot | Cómo se calcula | Campo en el JSON |
|---|---|---|---|
| Demanda | "Demanda" | Conteo de tickets creados en el periodo (5 filtros aplicados: pipeline, bot, fecha, etc.) | `correo.kpis.demanda` |
| Gestionados | "Gestionados" | Conteo de tickets cerrados/resueltos por Lucía sin escalar | `correo.kpis.gestionados` |
| Escalados | "Escalados" | Conteo de tickets que pasaron a un agente humano | `correo.kpis.escalados` |
| % Gestión | "% Gestión" | `gestionados / demanda` (HubSpot ya lo trae calculado; no recalcular con la demanda de otro widget porque cada widget puede traer su propio rango de fecha) | `correo.kpis.pct_gestion` |
| Gestión de Lucía por stage | "Gestión de Lucía por stage" | Conteo de tickets por `stage` del pipeline (Closed COL_Sup, Cerrados Consultas API_Sup, etc.) — 16 stages activos hoy | `correo.por_stage[]` |
| Escaladas vs. Gestionadas por semana | "Gestión" (chart combinado) | Serie temporal semanal de escaladas y gestionadas | `correo.tendencia_semanal[]` |
| CSAT | "CSAT - Lucía -" | Respuestas de encuesta de satisfacción por semana. **Ojo:** el volumen de respuestas es bajo (2-4 por semana) — no tratarlo como métrica confiable todavía | `correo.csat.serie_semanal[]` |

**Cómo obtener estos datos vía API en vez de la UI:**
HubSpot no expone una API pública que replique un dashboard/widget de Reports 1:1. La forma correcta de automatizar esto es replicar el filtro del widget contra el objeto **TICKET** usando la Search API de HubSpot (`/crm/v3/objects/tickets/search`), filtrando por:
- pipeline / stage (mismos que aparecen en "Gestión de Lucía por stage")
- propiedad que identifica que el ticket fue gestionado por el bot Lucía (revisar con el equipo qué propiedad usa el widget — probablemente `hubspot_owner_id` = bot, o una propiedad custom tipo `gestionado_por`)
- `createdate` dentro del rango del día/semana

Para el CSAT, HubSpot sí tiene Feedback Surveys con su propio objeto (`FEEDBACK_SUBMISSION`), consultable vía CRM API.

**⚠️ Filtro obligatorio — excluir tráfico de bounce de Amazon SES:**
Antes de calcular CUALQUIER métrica de correo (demanda, gestionados, escalados, % gestión, reopen, tiempo de cierre), excluir todo ticket donde `hs_all_associated_contact_emails` sea **exactamente igual (EQ)** a `mailer-daemon@amazonses.com`. Usar coincidencia exacta — **no** "contiene" ni "contiene token" (`CONTAINS_TOKEN`), porque ese tipo de comparación fragmenta el email por los puntos y genera conteos inflados (falsos positivos).

Contexto: `mailer-daemon@amazonses.com` es el remitente automático de notificaciones de rebote (bounce) de Amazon SES, el servicio de correo que usa el sistema interno de facturación electrónica de Alegra para notificaciones. No es un cliente real ni un caso de soporte — es tráfico automático generado cuando un correo que Alegra envía no logra entregarse. Se descubrió que ese tráfico estaba entrando como tickets normales al pipeline de soporte, inflando artificialmente el volumen (llegó a generar miles de tickets, con picos fuertes de un día para otro), el reopen rate y el tiempo de cierre. Si se deja adentro, las cifras no reflejan carga real de soporte sino ruido de infraestructura de correo.

Este mismo filtro se aplicó ya en el dashboard hermano de CE-Retention (`ce-retention-soporte-ops`) — aquí se documenta para que la automatización de Lucía Correo (sección 5) lo aplique también desde el primer script de fetch.

**Recomendación práctica:** antes de escribir el script de automatización, pedirle a quien construyó estos reportes (Estefanía) el filtro exacto de cada widget (clic en "Filtros (N)" de cada tarjeta en HubSpot) para copiar exactamente esos criterios a la Search API. Así el número automatizado coincide con el que ve el equipo en HubSpot.

## 3. Mapeo de métricas — Lucía Chat

Fuente: HubSpot → Reports Dashboard `6180490` → vista `20257473` (conversaciones/chat, `dataSourceName=CONVERSATION`, filtro `Lucia`).

| Métrica en el dash | Widget de HubSpot | Cómo se calcula | Campo en el JSON |
|---|---|---|---|
| Demanda | "Demanda" | Conteo de conversaciones creadas en el periodo | `chat.kpis.demanda` |
| Ingresados al bot | "Ingresados al bot" | Conversaciones que sí entraron al flujo de Lucía | `chat.kpis.ingresados_bot` |
| Escalados | "Escalados" | Conversaciones que Lucía pasó a un agente humano | `chat.kpis.escalados` |
| Gestionados | "Gestionados" | Conversaciones resueltas por Lucía sin escalar | `chat.kpis.gestionados` |
| % Gestión | "% Gestión" | `gestionados / ingresados_bot` | `chat.kpis.pct_gestion` |
| CSAT gestionado por bot | "CSAT gestionado por bot" | % de satisfacción de las conversaciones que gestionó Lucía | `chat.kpis.csat_bot` |
| Ingresados por versión | "Ingresados a Lucía por versión" | Conteo de conversaciones por país/versión de Alegra (COL, MEX, DOM, CRI, PER, VEN, OTHER) | `chat.ingresados_por_version[]` |
| Motivos de solicitud | "Motivos de solicitud - {vertical}" (6 widgets: COL AC, Payments, Countries AC, Contador, POS, NE) | Conteo de conversaciones por motivo específico dentro de cada vertical (decenas de motivos por vertical — el dash muestra el top 5-8) | `chat.motivos_solicitud.{vertical}[]` |
| Tiempo promedio de solución | "Tiempo promedio de solución" | Promedio de minutos para cerrar la conversación (mes en curso) | `chat.tiempo_promedio_solucion_min` |

La fuente CONVERSATION en HubSpot corresponde al objeto de conversaciones del Conversations API (`/conversations/v3/conversations`). Igual que en correo: antes de automatizar, revisar el filtro exacto de cada widget en HubSpot (ícono "Filtros (N)") para replicarlo con la API — en particular cómo se identifica "Lucia" como bot/canal (probablemente `channelInstanceId` o una propiedad de la conversación).

## 4. Cómo actualizar el dashboard manualmente (mientras no esté automatizado)

1. Abrir los dos paneles de HubSpot:
   - Correo: https://app.hubspot.com/reports-dashboard/6180490/view/20862583
   - Chat: https://app.hubspot.com/reports-dashboard/6180490/view/20257473
2. **Ajustar el filtro de fecha a la semana que se va a capturar** (por ejemplo "posterior a" el lunes y "anterior a" el domingo siguiente) — no dejar el filtro que traiga desde julio, porque eso duplicaría lo que ya está en el histórico.
3. Copiar los valores de cada widget según las tablas de las secciones 2 y 3.
4. Editar `lucia_dashboard_history.json`: **agregar un objeto nuevo al final del array `snapshots`** (no reemplazar los que ya están), con esta forma:
   ```json
   {
     "id": "wk-2026-08-24",
     "semana_inicio": "2026-08-24",
     "semana_fin": "2026-08-30",
     "generado": "2026-08-31",
     "bootstrap": false,
     "etiqueta": "24 – 30 ago 2026",
     "correo": { "kpis": {...}, "por_stage": [...], "tendencia_semanal": [...], "csat": {...} },
     "chat": { "kpis": {...}, "ingresados_por_version": [...], "motivos_solicitud": {...}, "tiempo_promedio_solucion_min": ... }
   }
   ```
   El contenido de `correo` y `chat` tiene exactamente la misma forma que ya tenían en el snapshot anterior (ver sección 1.1) — solo cambian los números.
5. Copiar ese mismo contenido (histórico completo, con el snapshot nuevo agregado) dentro de `lucia_dashboard_history.js`, reemplazando lo que está después de `window.LUCIA_HISTORY = ` (o pedirle a Claude/al script que lo regenere a partir del JSON — es una envoltura trivial).
6. Guardar y abrir `index.html` con doble clic — el selector de periodo va a mostrar la semana nueva como opción, y "Última semana" la selecciona automáticamente.

## 5. Automatización semanal — próximo paso

La idea (según lo conversado) es que un job corra automáticamente cada semana y **agregue** un snapshot nuevo a `lucia_dashboard_history.json` (nunca que lo sobreescriba). Pasos sugeridos para construir ese job:

1. **Script de fetch** (Node o Python) que:
   - Llama a HubSpot Search API / Conversations API con los filtros exactos de cada widget (ver secciones 2 y 3), acotado a la semana que cierra.
   - Calcula los mismos agregados (conteos, %, promedios).
   - Lee `lucia_dashboard_history.json`, hace `push()` de un snapshot nuevo con la forma de la sección 1.1, y lo vuelve a escribir completo (histórico + snapshot nuevo).
   - Regenera `lucia_dashboard_history.js` a partir del JSON actualizado.
2. **Autenticación**: crear un HubSpot Private App con scopes de lectura de tickets, conversaciones y feedback submissions; guardar el token como variable de entorno, nunca hardcodeado.
3. **Programación**: correrlo semanalmente (por ejemplo, lunes 06:00 COT / 11:00 UTC, para capturar la semana que acaba de cerrar). Puede ser:
   - Un cron real en un servidor/máquina de Alegra (más confiable, no depende de que alguien tenga una sesión abierta), o
   - Una tarea programada de Claude que llame a los conectores de HubSpot ya disponibles en este entorno y escriba el JSON en esta misma carpeta.
4. **Verificación**: cada corrida debería loguear cuántos tickets/conversaciones trajo y compararlo contra un rango razonable (para detectar si la API cambió o el filtro dejó de aplicar bien) antes de agregar el snapshot — y verificar que no exista ya un snapshot con la misma `semana_inicio` (para no duplicar si el job corre dos veces).

Cuando se retome ElevenLabs, este mismo instructivo se extiende con la sección de Lucía Llamadas: mapeo de `bi_bot_calls` (Metabase, ya trae datos de ElevenLabs) cruzado con la API de ElevenLabs Conversational AI para conversaciones que aún no llegan a Metabase.

## 7. Mapeo de métricas — Lucía Llamadas

Fuentes (dos, cruzadas):
- **HubSpot CRM, objeto `CALL`** — fuente de negocio: si la llamada se resolvió o se escaló, y por qué. Se filtra por la propiedad custom `bot_calificador` (valores exactos hoy: `lucia-ivr` = COL, `lucia-ivr-dom` = DOM, `lucia ivr fuerahorario` = fuera de horario), acotado por `hs_createdate` a la semana.
- **ElevenLabs Conversational AI API** (`GET /v1/convai/conversations`) — fuente técnica: duración, si el bot completó su flujo sin error, número de turnos. Se consulta por `agent_id` (ver `elevenlabs_config.json`) acotado por `call_start_after_unix`/`call_start_before_unix`.

| Métrica en el dash | Fuente / campo | Cómo se calcula | Campo en el JSON |
|---|---|---|---|
| Demanda | HubSpot `CALL`, conteo | Total de llamadas en la semana, para los 3 `bot_calificador` | `llamadas.kpis.demanda` |
| Gestionadas | HubSpot `estado_llamada` | Bucket `soporte correcto` (normalizado a minúsculas — ver nota de calidad de datos abajo) | `llamadas.kpis.gestionadas` |
| Escaladas | HubSpot `estado_llamada` | Suma de todas las variantes `escalamiento por...` / `transferencia por...` | `llamadas.kpis.escaladas` |
| No contestadas | HubSpot `estado_llamada` | `no respuesta` + `se cuelga la llamada` + `usuario colgó` | `llamadas.kpis.no_contestadas` |
| % Gestión | Calculado | `gestionadas / demanda` | `llamadas.kpis.pct_gestion` |
| Duración promedio | HubSpot `hs_call_duration` (ms → seg) | Promedio ponderado por volumen entre los 3 bots | `llamadas.kpis.duracion_prom_seg` |
| Por versión (COL/DOM/Fuera de horario) | HubSpot, agrupado por `bot_calificador` | Mismos KPIs de arriba, desglosados | `llamadas.por_version[]` |
| Motivo de escalamiento | HubSpot `estado_llamada` (solo las variantes de escalamiento/transferencia) | Conteo agrupado por motivo de fondo (petición del usuario, desconocimiento, falta de acceso, error de cobro) | `llamadas.motivo_escalamiento[]` |
| % Completadas sin error técnico | ElevenLabs `call_successful` | % de conversaciones que el propio ElevenLabs marca `success` — **NO equivale a "gestionadas"**, ver nota abajo | `llamadas.elevenlabs.totales.pct_completadas_sin_error_tecnico` |
| Duración (cruce ElevenLabs) | ElevenLabs `call_duration_secs` | Solo como control de calidad contra la duración de HubSpot — deben coincidir casi exacto | `llamadas.elevenlabs.totales.duracion_prom_seg` |

**⚠️ No confundir "% Completadas sin error técnico" (ElevenLabs) con "% Gestión" (HubSpot).** El primero mide si el bot terminó su flujo de conversación sin fallar técnicamente — una llamada que termina transferida a un humano cuenta igual como "exitosa" para ElevenLabs. El segundo mide si la llamada se resolvió SIN necesitar un humano, que es la pregunta de negocio real. En la semana de prueba (10-16 ago 2026) esto se vio clarísimo: ElevenLabs marcó ~98% de éxito técnico, mientras que HubSpot mostró que solo ~18.6% se gestionó sin escalar. Ambas cifras son correctas, solo responden preguntas distintas — nunca mostrarlas una junto a la otra sin esta aclaración.

**Calidad de datos a vigilar en `estado_llamada` (HubSpot):**
- El texto no tiene mayúsculas/minúsculas ni tildes consistentes (`"Soporte correcto"` vs `"soporte correcto"`) — siempre normalizar a minúsculas antes de agrupar.
- Existe una variante mal escrita `"seporte correcto"` (typo) que hay que mapear igual al bucket de gestionadas.
- Aparecen ocasionalmente valores numéricos sueltos (`"4"`, `"5"`) en `estado_llamada` — parecen calificaciones que quedaron mal guardadas en ese campo por error de captura. Van a un bucket `sin_clasificar`, no se descartan silenciosamente.

**Cobertura incompleta a día de hoy:** `elevenlabs_config.json` solo tiene los `agent_id` de COL y DOM — el bot "Fuera de horario" todavía no tiene su `agent_id` de ElevenLabs confirmado/agregado, así que el cruce técnico de esa versión queda pendiente (el lado de HubSpot sí lo cubre completo).

**Nota sobre el `index.html` actual:** por fuera de esta conversación, `index.html` fue rediseñado con una barra lateral de navegación (en vez de pestañas) y un chequeo de autenticación (`/api/auth/me`) para el despliegue en Vercel — la lógica de agregación (`aggregateCorreo`/`aggregateChat`/`setupRangeBar`) se mantuvo igual. Se agregó `aggregateLlamadas()` y `renderLlamadas()` siguiendo ese mismo patrón, y se corrigió un bug donde el snapshot de Llamadas (por ser más reciente en fecha) hacía que "Última semana" de Correo y Chat mostrara ceros — ahora cada sección usa el último snapshot que sí trae sus datos, no simplemente el último del histórico completo.

## 6. Anexo — por qué no se agregaron más widgets de los 2 paneles originales

Se revisó a fondo qué otros widgets existen **dentro de los mismos dos paneles autorizados** (vista `20862583` para correo, vista `20257473` para chat — no se tocó ningún otro panel ni informe de HubSpot) para ver si valía la pena sumar 2-3 métricas más por sección. Conclusión honesta: no se encontró suficiente contenido nuevo y confiable como para forzar esa cantidad sin bajar la calidad del dashboard. Detalle:

**Correo (vista 20862583):** de los 8 widgets del panel, 7 ya están en el dashboard (Demanda, Gestionados, Escalados, % Gestión, Gestión de Lucía por stage, Gestión semanal, CSAT). El único widget que falta, **"Correos que gestiona lucía por estado"**, es un gráfico de barras semanal desglosado en los mismos 6 sub-estados que ya se muestran agregados en "Gestión de Lucía por stage" — es la misma información, solo cortada por semana en vez de sumada en el periodo. Agregarlo no suma un dato nuevo, solo reordena uno que ya está.

**Chat (vista 20257473):** se revisaron los widgets no usados todavía:
- **"CSAT - Lucía"**: sí es información nueva (volumen diario de respuestas a la encuesta + score de satisfacción por día, en vez del único número agregado que ya se muestra). Se verificó con captura de pantalla que los datos que se leyeron coinciden con lo que se ve en HubSpot. No se incorporó todavía al archivo de datos por precaución de tiempo, pero es la mejor candidata a agregar en una próxima sesión si se quiere profundizar en CSAT.
- **"Chats que ingresan al flujo"** (serie diaria "Lucia" vs "No"): al sumar sus valores, el total coincide con la resta de los KPIs que ya están en el dashboard (Demanda − Ingresados al bot). Es decir, es el mismo dato de "Demanda" y "Ingresados al bot" pero repartido día a día — no aporta un número nuevo, solo el desglose temporal de algo que ya se ve.
- **"Gestión Lucía"** (gráfico combinado Gestionadas/Escaladas/% Gestión por día): al compararlo visualmente contra el widget "Ingresados a Lucía por versión", las barras muestran **exactamente los mismos valores día a día** (por ejemplo 354, 347, 356, 112, 21... en ambos). Eso indica que este widget en HubSpot probablemente quedó mal configurado o es una copia de otro reporte que no se actualizó — no es información confiable para usar en un dashboard de negocio. Se recomienda avisarle a quien administra estos paneles en HubSpot (Estefanía) para que lo revise, en vez de construir sobre un dato que puede estar mal.
- **"Chats ingresados" / "Chats gestionados" / "Chats escalados" / "Chats que ingresan no ingresan al flujo"**: son tablas de conversaciones individuales (nombre del contacto, ID de hilo, bandeja de entrada) — sirven para auditar casos puntuales, no para un KPI de dashboard.

**Recomendación:** si más adelante se quiere sumar "CSAT - Lucía" (la única candidata sólida), lo más seguro es pedir el export a CSV directamente desde HubSpot (menú "..." de la tarjeta → Exportar) en vez de leer los números desde la pantalla, para eliminar cualquier margen de error de transcripción.
