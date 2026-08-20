# Instructivo — Dashboard Lucía (Correo + Chat)

Este documento explica de dónde sale cada métrica del dashboard `index.html`, cómo se transforma, y cómo actualizarlo. La sección de **Lucía Llamadas** (ElevenLabs + Metabase) queda pendiente — se retoma en otra sesión.

## 1. Cómo funciona el dashboard

`index.html` no trae datos "quemados": cuando abre, lee los datos y con eso pinta los KPIs, gráficos y tablas. El HTML nunca se toca — solo se regeneran los archivos de datos.

```
index.html                    → la interfaz (no cambia salvo que se rediseñe)
lucia_dashboard_data.js       → los datos que realmente carga el navegador (window.LUCIA_DATA = {...})
lucia_dashboard_data.json     → los mismos datos en JSON plano (para el pipeline/API, no lo lee el navegador directo)
```

**¿Por qué dos archivos de datos?** Este dashboard se abre con doble clic desde el explorador de Windows (`file:///C:/Users/...`), y Chrome bloquea por seguridad que una página local (`file://`) haga `fetch()` de otro archivo local — falla en silencio, sin ningún error visible, y la página se queda cargando para siempre. Por eso `index.html` carga `lucia_dashboard_data.js` con una etiqueta `<script src="...">` (eso sí funciona desde `file://`), y ese archivo simplemente asigna el mismo contenido a `window.LUCIA_DATA`. `lucia_dashboard_data.json` se mantiene como el formato "limpio" para que el script de automatización lo genere fácil; al final del proceso ese JSON se envuelve en `window.LUCIA_DATA = <json>;` para producir el `.js`.

Si en algún momento este dashboard se sirve desde un servidor real (como el de Valentina, con `/api/auth/...`) en vez de abrirse con doble clic, el HTML igual funciona: si no encuentra `lucia_dashboard_data.js` intenta `fetch('./lucia_dashboard_data.json')` como respaldo.

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
2. Copiar los valores de cada widget según la tabla de arriba.
3. Editar `lucia_dashboard_data.json` con los valores nuevos (mantener la misma estructura de campos).
4. Copiar ese mismo contenido dentro de `lucia_dashboard_data.js`, reemplazando lo que está después de `window.LUCIA_DATA = ` (o pedirle a Claude/al script que lo regenere a partir del JSON — es una envoltura trivial).
5. Guardar y abrir `index.html` con doble clic — el dashboard recarga automáticamente los datos nuevos.

## 5. Automatización diaria (6:00 a.m. COT) — próximo paso

La idea (según lo conversado) es que un job corra todas las mañanas a las 6:00 a.m. hora Colombia y regenere `lucia_dashboard_data.json` solo. Pasos sugeridos para construir ese job:

1. **Script de fetch** (Node o Python) que:
   - Llama a HubSpot Search API / Conversations API con los filtros exactos de cada widget (ver secciones 2 y 3).
   - Calcula los mismos agregados (conteos, %, promedios).
   - Escribe `lucia_dashboard_data.json` con la misma estructura que ya tiene hoy.
2. **Autenticación**: crear un HubSpot Private App con scopes de lectura de tickets, conversaciones y feedback submissions; guardar el token como variable de entorno, nunca hardcodeado.
3. **Programación**: correrlo con un cron a las 06:00 COT (11:00 UTC). Puede ser:
   - Un cron real en un servidor/máquina de Alegra (más confiable, no depende de que alguien tenga una sesión abierta), o
   - Una tarea programada de Claude que llame a los conectores de HubSpot ya disponibles en este entorno y escriba el JSON en esta misma carpeta.
4. **Verificación**: cada corrida debería loguear cuántos tickets/conversaciones trajo y compararlo contra un rango razonable (para detectar si la API cambió o el filtro dejó de aplicar bien) antes de sobrescribir el JSON.

Cuando se retome ElevenLabs, este mismo instructivo se extiende con la sección de Lucía Llamadas: mapeo de `bi_bot_calls` (Metabase, ya trae datos de ElevenLabs) cruzado con la API de ElevenLabs Conversational AI para conversaciones que aún no llegan a Metabase.

## 6. Anexo — por qué no se agregaron más widgets de los 2 paneles originales

Se revisó a fondo qué otros widgets existen **dentro de los mismos dos paneles autorizados** (vista `20862583` para correo, vista `20257473` para chat — no se tocó ningún otro panel ni informe de HubSpot) para ver si valía la pena sumar 2-3 métricas más por sección. Conclusión honesta: no se encontró suficiente contenido nuevo y confiable como para forzar esa cantidad sin bajar la calidad del dashboard. Detalle:

**Correo (vista 20862583):** de los 8 widgets del panel, 7 ya están en el dashboard (Demanda, Gestionados, Escalados, % Gestión, Gestión de Lucía por stage, Gestión semanal, CSAT). El único widget que falta, **"Correos que gestiona lucía por estado"**, es un gráfico de barras semanal desglosado en los mismos 6 sub-estados que ya se muestran agregados en "Gestión de Lucía por stage" — es la misma información, solo cortada por semana en vez de sumada en el periodo. Agregarlo no suma un dato nuevo, solo reordena uno que ya está.

**Chat (vista 20257473):** se revisaron los widgets no usados todavía:
- **"CSAT - Lucía"**: sí es información nueva (volumen diario de respuestas a la encuesta + score de satisfacción por día, en vez del único número agregado que ya se muestra). Se verificó con captura de pantalla que los datos que se leyeron coinciden con lo que se ve en HubSpot. No se incorporó todavía al archivo de datos por precaución de tiempo, pero es la mejor candidata a agregar en una próxima sesión si se quiere profundizar en CSAT.
- **"Chats que ingresan al flujo"** (serie diaria "Lucia" vs "No"): al sumar sus valores, el total coincide con la resta de los KPIs que ya están en el dashboard (Demanda − Ingresados al bot). Es decir, es el mismo dato de "Demanda" y "Ingresados al bot" pero repartido día a día — no aporta un número nuevo, solo el desglose temporal de algo que ya se ve.
- **"Gestión Lucía"** (gráfico combinado Gestionadas/Escaladas/% Gestión por día): al compararlo visualmente contra el widget "Ingresados a Lucía por versión", las barras muestran **exactamente los mismos valores día a día** (por ejemplo 354, 347, 356, 112, 21... en ambos). Eso indica que este widget en HubSpot probablemente quedó mal configurado o es una copia de otro reporte que no se actualizó — no es información confiable para usar en un dashboard de negocio. Se recomienda avisarle a quien administra estos paneles en HubSpot (Estefanía) para que lo revise, en vez de construir sobre un dato que puede estar mal.
- **"Chats ingresados" / "Chats gestionados" / "Chats escalados" / "Chats que ingresan no ingresan al flujo"**: son tablas de conversaciones individuales (nombre del contacto, ID de hilo, bandeja de entrada) — sirven para auditar casos puntuales, no para un KPI de dashboard.

**Recomendación:** si más adelante se quiere sumar "CSAT - Lucía" (la única candidata sólida), lo más seguro es pedir el export a CSV directamente desde HubSpot (menú "..." de la tarjeta → Exportar) en vez de leer los números desde la pantalla, para eliminar cualquier margen de error de transcripción.
