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

En el dashboard mismo, arriba de las tarjetas de KPI de cada sección (Correo / Chat / Llamadas) hay una barra de filtros (rediseñada el 21-ago-2026 a pedido de Lauren, para que se vea limpia tipo selector de fechas de aerolínea/reservas — ver sección 1.3):
- **Fecha (Desde → Hasta)**: dos campos de fecha con calendario nativo del navegador. Se incluye todo snapshot cuya semana se solape con el rango elegido; los conteos se suman, los porcentajes se recalculan sobre los totales del rango, y el CSAT/tiempo de solución se promedian ponderados por volumen. Hay que presionar **Aplicar** para que el filtro se ejecute.
- **Versión**: selector de país/versión (COL, DOM, Fuera de horario, etc. — ver sección 1.3 para qué tan real es este filtro en cada sección).

Se **eliminó** el selector "Todo el histórico" / "Última semana", los botones de mes y la función de "Comparar con otro periodo" (delta % contra un segundo rango) — a pedido explícito de Lauren, para simplificar la barra. Si en el futuro se quiere volver a tener comparación entre periodos, hay que reconstruirla desde cero (el código viejo de `deltaInfo`/`range-compare` se borró, no quedó comentado).

### 1.3 Filtro por versión — qué tan real es en cada sección

Lauren pidió (reunión 21-ago-2026) poder filtrar el dashboard por versión/país, igual que el filtro "Ente contable" del dashboard de Métricas del negocio (PODs). La respuesta honesta es distinta por sección, porque no todas tienen los datos desglosados por versión:

- **Llamadas — filtro real y completo.** Los datos de origen (`llamadas.por_version[]` de HubSpot y `llamadas.elevenlabs.por_version[]`) ya vienen desglosados por COL/DOM/Fuera de horario, así que el filtro recalcula de verdad demanda, gestionadas, escaladas, no contestadas, % gestión, duración y el cruce de ElevenLabs para la versión elegida. Único hueco: el **motivo de escalamiento** se captura agregado (las 3 versiones juntas) — si hay un filtro de versión activo, esa tarjeta se oculta con una nota en vez de mostrar un dato mezclado y engañoso. Para arreglarlo de raíz habría que pedir que `estado_llamada`/motivo se capture ya separado por `bot_calificador` en HubSpot.
- **Chat — filtro parcial.** Solo el widget "Ingresados a Lucía por versión" tiene desglose por país (COL, MEX, DOM, CRI, PER, VEN, OTHER); el resto de KPIs del panel de Chat en HubSpot (demanda, escalados, gestionados, % gestión, CSAT bot) **no vienen separados por versión** — son un solo número agregado. El selector de versión en Chat filtra ese gráfico y muestra una nota aclarando la limitación; las tarjetas KPI de arriba siempre muestran el total, sin importar la versión elegida. Para que el filtro fuera completo, habría que pedirle a HubSpot (o a Estefanía, quien administra los paneles) que desglose esos widgets por país/versión igual que ya está desglosado "Ingresados por versión".
- **Correo — sin filtro todavía.** El desglose que existe (`correo.por_stage[]`) es por *stage del pipeline* (Closed COL_Sup, Nómina_Sup, Payments Sup, POS_Sup, etc.), que mezcla país y tipo de consulta — no es un campo limpio de "versión/país" que se pueda usar para filtrar. El selector de versión en esta sección queda deshabilitado con la etiqueta "No disponible" y una nota explicando por qué. Para habilitarlo de verdad haría falta que el reporte de origen en HubSpot traiga una propiedad de país/versión limpia a nivel de ticket (no solo mezclada en el nombre del stage).

### 1.4 Cambios de la reunión Jesus/Lauren (21-ago-2026) — segunda ronda

Después de revisar la primera versión del filtro y las tarjetas, Lauren mandó una serie de ajustes por Slack. Estos ya están implementados:

**Corrección de dato — Correo `gestionados` (prioridad, dato incorrecto desde el bootstrap):**
El snapshot `boot-2026-07-01` traía `correo.kpis.gestionados: 1400`, un número **mayor que la demanda (689)** — imposible, daba 203% de gestión. Investigado directamente contra HubSpot (`query_crm_data`/`search_properties` sobre el objeto TICKET): el desglose `por_stage` de ese mismo snapshot sumaba 1.398, casi idéntico a 1.400, y **el 84% de esa suma (1.171) venía de la pipeline "Correos que no requieren respuesta"** — notificaciones automáticas, no tráfico real de soporte gestionado por Lucía. Es el mismo patrón que el bounce de `mailer-daemon@amazonses.com`: ruido automático inflando un conteo.

Corrección aplicada: se excluyó esa pipeline (cualquier stage cuyo nombre contenga "correos que no requieren respuesta") tanto del `por_stage` guardado como del cálculo de `gestionados`. Resultado: **`gestionados: 226`** (suma exacta del `por_stage` corregido), **`pct_gestion: 32.8%`** — un número que sí tiene sentido. El campo `pct_gestion` guardado en el JSON es solo informativo (el dashboard lo recalcula en vivo desde `demanda`/`gestionados`), pero se actualizó igual para que quien lea el JSON crudo no se confunda.

⚠️ No se pudo verificar 100% que esto reproduce el filtro exacto que usó originalmente el widget "Gestionados" de HubSpot (se intentó vía la propiedad `categoria_bot_lucia`, pero esa propiedad devolvió 14.443 tickets con asunto "Conversación..." — parece pertenecer a Chat, no a este reporte de Correo). La corrección se basa en la aritmética del propio `por_stage` ya capturado, que es sólida. Si en algún momento se automatiza la captura de Correo (sección 5), hay que asegurarse de que el filtro de la nueva pipeline de fetch excluya esta misma pipeline "Correos que no requieren respuesta" desde el origen.

**Tarjetas KPI — Correo:**
- El número grande de cada tarjeta ahora es el **%**, con el conteo absoluto chiquito debajo (antes era al revés). Aplica a "Gestionados" (`gestionados/demanda`) y "Escalados" (`escalados/demanda`, tarjeta nueva `kpis.pct_escalados`).
- Se eliminó la tarjeta suelta de "% Gestión" (ya queda implícita en la tarjeta de Gestionados). Quedan 3 tarjetas: Demanda, Gestionados, Escalados.
- *Pendiente, no resuelto en esta ronda*: una 4ª tarjeta de CSAT tipo NPS — bloqueada porque hoy solo se captura el conteo de respuestas por semana, no el puntaje individual (1-10) de cada una. Ver sección 2 para el detalle.

**"Gestión de Lucía por stage":** cambió de mostrar solo el conteo absoluto a mostrar **% sobre la demanda total del periodo, con el absoluto entre paréntesis** — ej. "23% (161)". La pipeline "Correos que no requieren respuesta" ya no aparece en esta lista (ver corrección de dato arriba).

**"Escaladas vs. Gestionadas por semana":** pasó de barras a **líneas de tendencia**. El eje Y sigue en números absolutos, pero cada punto de la línea "Gestionadas" trae una etiqueta con el **% de gestión de esa semana** (`gestionadas / (escaladas + gestionadas)`).

**Tarjetas KPI — Chat:**
- Se reordenaron: Demanda → Ingresados al bot → **Gestionados** → Escalados → CSAT bot (antes Escalados iba antes que Gestionados).
- Mismo tratamiento que Correo: Gestionados y Escalados muestran el % como número grande (`gestionados/ingresados_bot`, `escalados/ingresados_bot` — nuevo `kpis.pct_escalados`) con el conteo absoluto debajo. Se eliminó la tarjeta suelta de "% Gestión".

**"Embudo de gestión" (Chat) — reemplazado por un diagrama de flujo/árbol:** Lauren pidió específicamente un diagrama tipo árbol o Sankey en vez de las barras horizontales apiladas, porque el proceso es un flujo de decisiones (Entra/No entra → Lo resuelve el bot/Lo escala). Se construyó a mano con divs posicionados en % + un SVG superpuesto para las curvas (función `renderChatFlow()`) — **no se agregó ninguna librería nueva**, sigue siendo un solo archivo autocontenido. Incluye un número destacado arriba con la "Tasa de Contención del Bot" (`gestionados/ingresados_bot`). La tarjeta pasó de media-columna a ancho completo porque el diagrama necesita más espacio horizontal que el embudo de barras.

**"Ingresados a Lucía por versión":** pasó de barras verticales a **horizontales, en %** (sobre el total de ingresados de todas las versiones), **ordenadas de mayor a menor % empezando arriba**, con el número absoluto disponible al pasar el mouse (tooltip).

**"Motivos de solicitud por vertical" (Chat):** cambió de mostrar solo el conteo absoluto a mostrar **% con el absoluto entre paréntesis** — mismo formato que "Gestión de Lucía por stage" (ej. "25% (114)"). ⚠️ Diferencia importante en el denominador: `aggregateChat` solo guarda el **top 8 motivos** por vertical (no el total real de conversaciones de esa vertical), así que el % es *"porción de los 8 motivos más frecuentes que representa este"*, no *"porción de toda la demanda de la vertical"*. Es la única base disponible con los datos actuales — si más adelante se captura el total real por vertical, este cálculo debería cambiar para usar ese total en vez de la suma del top 8.

### 1.5 Cambios de la reunión Jesus/Lauren (24-ago-2026) — tercera ronda (Llamadas)

**Tarjetas KPI — Llamadas:** mismo tratamiento que Correo y Chat.
- "Gestionadas" → renombrada **"Gestionadas por Lucía"**: número grande ahora es el % (`kpis.pct_gestion`), el absoluto (`gestionadas`) va chiquito debajo.
- Se eliminó la tarjeta suelta "% Gestión Lucía" (ya queda implícita en la tarjeta de Gestionadas).
- "Escaladas" → renombrada **"Escaladas a humano"**: número grande = % (`kpis.pct_escaladas`, nuevo, `escaladas/demanda`), absoluto chiquito debajo.
- "No contestadas": número grande = % (`kpis.pct_no_contestadas`, nuevo, `no_contestadas/demanda`), absoluto chiquito debajo.
- Demanda y Duración prom. no cambiaron (no son proporciones sobre la demanda, se quedan con su valor absoluto como número grande).
- Quedan 5 tarjetas en vez de 6.

**"¿Se pueden hacer dinámicas las leyendas chiquitas?"** — sí: antes eran texto fijo (ej. "resueltas por Lucía", "pasaron a humano"); ahora, para las tres tarjetas que muestran %, la leyenda chiquita es el conteo absoluto real del periodo filtrado (ej. "251 llamadas"), calculado en cada render — ya no es texto estático.

**"¿La data se ordena sola de mayor a menor?"** — confirmado que sí, ya estaba implementado antes de esta ronda: tanto "Llamadas por versión" (`por_version.sort((a,b) => b.demanda - a.demanda)`) como "Motivo de escalamiento" (`motivo_escalamiento` ya se genera ordenado por `count` descendente en `aggregateLlamadas`) recalculan el orden en cada render a partir del periodo/filtro activo — si un mes cambia qué versión recibe más llamadas, la lista se reordena sola, no hay ningún orden fijo hardcodeado.

**"Motivo de escalamiento":** cambió de mostrar solo el conteo absoluto a mostrar **% con el absoluto entre paréntesis** (ej. "50% (520)"), mismo formato que las otras listas de motivos/stages. El % es sobre el total de escalamientos con motivo capturado en el periodo/filtro activo.

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

**Nota sobre el `index.html` actual:** por fuera de esta conversación, `index.html` fue rediseñado con una barra lateral de navegación (en vez de pestañas) y un chequeo de autenticación (`/api/auth/me`) para el despliegue en Vercel — la lógica de agregación (`aggregateCorreo`/`aggregateChat`) se mantuvo igual. Se agregó `aggregateLlamadas()` y `renderLlamadas()` siguiendo ese mismo patrón, y se corrigió un bug donde el snapshot de Llamadas (por ser más reciente en fecha) hacía que "Última semana" de Correo y Chat mostrara ceros — ahora cada sección usa el último snapshot que sí trae sus datos, no simplemente el último del histórico completo.

**21-ago-2026 — rediseño del filtro + filtros por versión + ajustes de la reunión Jesus/Lauren:**
- Se reemplazó `setupRangeBar()` (selects de semana + botones de preset + botones de mes + comparación) por `setupFilterBar()`: dos `<input type="date">` nativos + un selector de versión + botón "Aplicar" — ver sección 1.2/1.3 arriba.
- En **Llamadas**, la tarjeta "% Gestión" se renombró a **"% Gestión Lucía"** y se movió justo al lado de "Gestionadas" (orden actual: Demanda → Gestionadas → % Gestión Lucía → Escaladas → No contestadas → Duración prom.), siguiendo la decisión de Lauren en la reunión del 21-ago-2026: que se lea el recorrido completo (entra → lo gestiona Lucía y en qué % → lo que escala) antes de aclarar de dónde salen las 68 "no contestadas". *Esto mismo se decidió en la reunión solo para la sección de Llamadas — no se aplicó a Correo, que sigue con "% Gestión" en su posición original.*
- Se corrigió un bug de `safeChart()`: al re-aplicar el filtro (o cambiar de versión) sin recargar la página, el canvas de Chart.js no se destruía antes de crear el chart nuevo, y tiraba `Canvas is already in use`. Ahora `safeChart` llama `Chart.getChart(el)?.destroy()` antes de crear el chart — esto también arregla el mismo problema que ya existía silenciosamente antes en el selector viejo (cualquier cambio de dropdown lo disparaba, no solo el nuevo botón Aplicar).

**Pendiente de la reunión Jesus/Lauren (21-ago-2026) que NO se hizo en esta pasada** (no era parte de lo pedido esta vez, pero queda anotado para no perderlo):
- Cambiar los colores del dashboard (Lauren los calificó de "muy guía" / genéricos).
- Confirmar con Cris la lógica de las 68 llamadas "no contestadas": ¿deberían contarse como gestionadas, como escaladas, o quedarse en su propio bucket como está hoy?
- Solicitar acceso a Metabase para el equipo (bloqueado por el equipo de datos, decisión fuera del alcance de este dashboard).
- Centralizar/inventariar los 4 tableros que Jesús ha construido (Lauren pidió los links para revisarlos juntos).

## 6. Anexo — por qué no se agregaron más widgets de los 2 paneles originales

Se revisó a fondo qué otros widgets existen **dentro de los mismos dos paneles autorizados** (vista `20862583` para correo, vista `20257473` para chat — no se tocó ningún otro panel ni informe de HubSpot) para ver si valía la pena sumar 2-3 métricas más por sección. Conclusión honesta: no se encontró suficiente contenido nuevo y confiable como para forzar esa cantidad sin bajar la calidad del dashboard. Detalle:

**Correo (vista 20862583):** de los 8 widgets del panel, 7 ya están en el dashboard (Demanda, Gestionados, Escalados, % Gestión, Gestión de Lucía por stage, Gestión semanal, CSAT). El único widget que falta, **"Correos que gestiona lucía por estado"**, es un gráfico de barras semanal desglosado en los mismos 6 sub-estados que ya se muestran agregados en "Gestión de Lucía por stage" — es la misma información, solo cortada por semana en vez de sumada en el periodo. Agregarlo no suma un dato nuevo, solo reordena uno que ya está.

**Chat (vista 20257473):** se revisaron los widgets no usados todavía:
- **"CSAT - Lucía"**: sí es información nueva (volumen diario de respuestas a la encuesta + score de satisfacción por día, en vez del único número agregado que ya se muestra). Se verificó con captura de pantalla que los datos que se leyeron coinciden con lo que se ve en HubSpot. No se incorporó todavía al archivo de datos por precaución de tiempo, pero es la mejor candidata a agregar en una próxima sesión si se quiere profundizar en CSAT.
- **"Chats que ingresan al flujo"** (serie diaria "Lucia" vs "No"): al sumar sus valores, el total coincide con la resta de los KPIs que ya están en el dashboard (Demanda − Ingresados al bot). Es decir, es el mismo dato de "Demanda" y "Ingresados al bot" pero repartido día a día — no aporta un número nuevo, solo el desglose temporal de algo que ya se ve.
- **"Gestión Lucía"** (gráfico combinado Gestionadas/Escaladas/% Gestión por día): al compararlo visualmente contra el widget "Ingresados a Lucía por versión", las barras muestran **exactamente los mismos valores día a día** (por ejemplo 354, 347, 356, 112, 21... en ambos). Eso indica que este widget en HubSpot probablemente quedó mal configurado o es una copia de otro reporte que no se actualizó — no es información confiable para usar en un dashboard de negocio. Se recomienda avisarle a quien administra estos paneles en HubSpot (Estefanía) para que lo revise, en vez de construir sobre un dato que puede estar mal.
- **"Chats ingresados" / "Chats gestionados" / "Chats escalados" / "Chats que ingresan no ingresan al flujo"**: son tablas de conversaciones individuales (nombre del contacto, ID de hilo, bandeja de entrada) — sirven para auditar casos puntuales, no para un KPI de dashboard.

**Recomendación:** si más adelante se quiere sumar "CSAT - Lucía" (la única candidata sólida), lo más seguro es pedir el export a CSV directamente desde HubSpot (menú "..." de la tarjeta → Exportar) en vez de leer los números desde la pantalla, para eliminar cualquier margen de error de transcripción.
