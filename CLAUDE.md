# Dataforge

## Qué es esto

Dataforge es una aplicación web de aprendizaje de data engineering. Su propósito es ayudar a ingenieros a dominar los conceptos profundos y atemporales del oficio — los que aparecen en entrevistas senior y no quedan obsoletos cuando cambian las herramientas.

## Concepto central

Un layout de dos paneles:
- **Panel izquierdo**: lista ordenada por categorías (SQL, Spark, Airflow, Big Data, etc.), cada una expandida en N conceptos
- **Panel derecho**: al seleccionar un concepto, se muestra una descripción teórica en texto + una animación gráfica del concepto

La **animación gráfica es el diferencial principal**. Cada concepto debe tener una. Los conceptos simples (ej. LEFT JOIN) tienen animaciones directas; los complejos (ej. window functions en Spark) requieren visualizaciones más creativas. La animación es lo que distingue a Dataforge de una wiki o un blog.

## Filosofía de contenido

Foco en **conceptos transversales y atemporales** — cosas que siguen siendo verdad independientemente de qué herramienta esté de moda. Evitar profundizar en APIs de herramientas que cambian rápido o en configuración específica de versiones.

El filtro mental: *"¿Le seguirían preguntando esto a un ingeniero senior en una entrevista dentro de cinco años?"*

Buenos ejemplos (de experiencia real en entrevistas):
- Cómo gobernar datos con schemas cambiantes (schema evolution / schema drift)
- Qué es un archivo Parquet y por qué existe
- Qué es el formato Delta y qué problemas resuelve
- Semántica de map / reduce / shuffle en computación distribuida
- Window functions en Spark
- LEFT JOIN, deduplicación, slowly changing dimensions
- Patrones de orquestación, diseño de DAGs, idempotencia

## Categorías de contenido (alcance inicial)

- **SQL**: joins, window functions, agregaciones, CTEs, índices, planes de ejecución
- **Spark**: RDD vs DataFrame, particionado, shuffles, window functions, broadcast joins, evaluación lazy
- **Fundamentos de Big Data**: formatos de archivo (Parquet, Avro, ORC, Delta), layout de almacenamiento, columnar vs row
- **Modelado de datos**: star schema, tipos de SCD, normalización vs desnormalización
- **Orquestación**: diseño de DAGs, idempotencia, reintentos, gestión de dependencias (Airflow como ejemplo, los conceptos son genéricos)
- **Calidad y gobernanza de datos**: schema evolution, data contracts, linaje, observabilidad
- **Problemas frecuentes del DE**: datos tardíos, deduplicación, backfilling, schema drift, partition skew

## Motivación

El autor está en proceso de entrevistas para roles senior de data engineering y ha identificado brechas en los fundamentos transversales que los entrevistadores sondean consistentemente. Dataforge es a la vez una herramienta de estudio personal y un recurso compartible.

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite |
| Animaciones | Framer Motion + D3.js |
| Contenido | JSON files (en el repo) |
| Servidor | Nginx (Raspberry Pi, red local) |
| Acceso | http://192.168.x.x desde Windows en la misma red |

Sin backend ni base de datos. El contenido vive como archivos JSON versionados en el repo. Nginx sirve el build estático generado por `npm run build`.

### Archivos de datos

- `src/data/categories.json` — fuente de datos del app. Cada concepto requiere: `id`, `name`, `difficulty` (int 1–100), `theory` (string), `aplicacion` (string[]). El campo `difficulty` alimenta el badge y el orden en el sidebar.
- `src/data/roadmap.json` — tracking file del proyecto con los 187 conceptos planificados. Cada entrada tiene `name`, `order`, `difficulty`, `done`. Actualizar `done: true` al terminar cada concepto.
- `src/animations/index.js` — mapa `"concept-id": Componente`. La clave debe coincidir exactamente con el `id` en `categories.json`.

## Reglas de desarrollo

- Todo el código, nombres de variables, funciones, archivos y commits van en **inglés**
- Toda conversación, documentación y este archivo van en **español**

## Animaciones

Cada animación de concepto debe:
- Ser autocontenida y ejecutarse inline (sin dependencias externas si es posible)
- Ilustrar la *mecánica* del concepto, no solo etiquetarlo
- Ser suficientemente simple para entenderse en menos de 30 segundos sin sonido
- Funcionar bien en desktop (mobile es secundario)

## Estilo visual — consistencia obligatoria

Todas las animaciones comparten el mismo sistema de diseño. No romper ninguno de estos puntos al crear una nueva:

**Tema**: fondo claro (`#F4F7FF`, el mismo que usa `.animation-section`)

**Tipografía**: `IBM Plex Mono` exclusivamente, igual que el resto de la app

**Layout de dos paneles** dentro de la animación:
- Panel izquierdo: `flex: 1` — el canvas o la visualización principal
- Panel derecho: ancho fijo (~210–240px) — panel de información con título de escena, descripción y métricas clave

**Controles**: siempre presentes al pie — scrubber de progreso + botón pausar + botón reiniciar, con el color accent de la animación

**Ritmo**: cada escena dura entre 2 y 3 segundos. Actualmente se usa `TOTAL_MS = 27000` (9 escenas × 3 s)

**Paleta de colores**:
- Azul (eng / Driver): `#1875CC`, RGB `[24, 117, 204]`
- Naranja (sales / Executor 1): `#D4580A`, RGB `[212, 88, 10]`
- Verde (Executor 2): `#1BAA6E`, RGB `[27, 170, 110]`
- Violeta (Executor 3): `#7C44CC`, RGB `[124, 68, 204]`
- Textos oscuros sobre fondo claro: `#1A2040` (primario), `#4B5680` (secundario), `#9099B5` (muted)
- Bordes: `#D2D7E8`

**Dimensiones**: las cajas y elementos del canvas deben escalar proporcionalmente con `W` y `H` del canvas para ocupar bien el espacio disponible — no usar tamaños fijos en píxeles absolutos
