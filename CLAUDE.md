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

## Reglas de desarrollo

- Todo el código, nombres de variables, funciones, archivos y commits van en **inglés**
- Toda conversación, documentación y este archivo van en **español**

## Animaciones

Cada animación de concepto debe:
- Ser autocontenida y ejecutarse inline (sin dependencias externas si es posible)
- Ilustrar la *mecánica* del concepto, no solo etiquetarlo
- Ser suficientemente simple para entenderse en menos de 30 segundos sin sonido
- Funcionar bien en desktop (mobile es secundario)
