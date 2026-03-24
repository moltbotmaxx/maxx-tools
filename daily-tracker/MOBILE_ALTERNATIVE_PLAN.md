# Daily Tracker Mobile Alternative Plan

## Objetivo

Crear una alternativa móvil de `Daily Tracker` pensada desde cero para uso en teléfono. No se debe portar la UI actual ni reducirla de tamaño. La meta es diseñar un producto distinto en interfaz y flujo, pero compatible con los datos y la operación actual donde sí tenga sentido.

## Diagnóstico de la versión actual

La app actual está optimizada para escritorio:

- Una sola SPA muy grande en [`app.js`](/Users/tbnalfaro/Desktop/Sentient%20apps/maxx-tools/daily-tracker/app.js).
- Navegación por tabs densos: `Account`, `Sourcing`, `Selection`, `Scheduler`, `Metrics`.
- Interacción principal basada en `drag and drop` para mover cards entre `Selection`, `Staging` y `Schedule`.
- Layouts multi-columna y sidebars simultáneas en [`index.html`](/Users/tbnalfaro/Desktop/Sentient%20apps/maxx-tools/daily-tracker/index.html) y [`styles.css`](/Users/tbnalfaro/Desktop/Sentient%20apps/maxx-tools/daily-tracker/styles.css).
- Captura rápida resuelta con extensión de navegador, no con flujos móviles.

Conclusión: adaptar esta UI a móvil generaría una versión incómoda, compleja y con demasiadas concesiones. Conviene crear una experiencia móvil nueva con otro mapa de navegación y otras interacciones.

## Qué sí se puede reutilizar

- Autenticación con Google en Firebase.
- Persistencia en Firestore por usuario.
- Modelo actual base de trabajo:
  - `ideas`
  - `pool`
  - `schedule`
  - `permanentNotes`
  - `doneHeadlines`
- Feeds ya procesados para sourcing y datasets auxiliares.
- Reglas de seguridad ya definidas en [`firestore.rules`](/Users/tbnalfaro/Desktop/Sentient%20apps/maxx-tools/daily-tracker/firestore.rules).

## Qué no se debe reutilizar tal cual

- La estructura de tabs actual.
- El scheduler semanal de 7 columnas con slots vacíos.
- El `drag and drop` como interacción principal.
- Las sidebars paralelas de sourcing.
- El dashboard de métricas mensual tal como existe hoy.
- La extensión de Chrome como método principal de captura.

## Tesis de producto móvil

En móvil, `Daily Tracker` debe enfocarse en 4 trabajos concretos:

1. Capturar ideas o links en segundos.
2. Revisar y decidir rápido qué guardar, descartar o programar.
3. Ver con claridad qué toca publicar hoy y esta semana.
4. Marcar progreso sin entrar a un dashboard pesado.

La versión móvil no debe intentar ser “la app de escritorio en pequeño”. Debe ser un flujo operativo rápido, táctil y secuencial.

## Propuesta de experiencia móvil

### Navegación base recomendada

Bottom navigation con 4 tabs:

- `Hoy`
- `Inbox`
- `Plan`
- `Cuenta`

### 1. Hoy

Pantalla principal de uso diario.

- Lista de contenido programado para hoy.
- Acciones rápidas por card:
  - `Posted`
  - `Move`
  - `Back to Inbox`
  - `Open source`
- Vista tipo agenda o checklist, no grid semanal.
- Indicador simple de meta diaria.

### 2. Inbox

Unifica lo que hoy está disperso entre `Selection`, parte de `Sourcing` y el clipper.

- Ideas capturadas.
- Links compartidos desde otras apps.
- Items guardados desde sourcing.
- Filtros simples:
  - `All`
  - `Ideas`
  - `Links`
  - `Ready to plan`
- Swipe actions:
  - `Plan`
  - `Archive`
  - `Delete`

### 3. Plan

Espacio para organizar la semana con interacción móvil.

- Vista por días, estilo stack vertical o carrusel semanal.
- Cada día muestra cards programadas y capacidad restante.
- Programación con tap:
  - abrir card
  - elegir día
  - elegir posición o franja
- Reordenamiento por gestos dentro de un día, sin depender de una grilla de escritorio.

### 4. Cuenta

Vista liviana para:

- login/logout
- estado de sync
- cuentas administradas
- export
- ajustes

## Flujo de captura móvil

La extensión de Chrome debe ser reemplazada por una captura nativa para móvil:

- `Share sheet` desde navegador, Instagram, X, Reddit, etc.
- Recepción de URL + texto + título cuando exista.
- Normalización inmediata en `Inbox`.

Esto es crítico. Sin un flujo de captura móvil nativo, la app pierde una de sus ventajas operativas.

## Alcance recomendado para V1 móvil

### Incluir en V1

- Login con Google.
- Sync con Firestore.
- Tab `Hoy`.
- Tab `Inbox`.
- Tab `Plan`.
- Captura por share sheet.
- CRUD básico de ideas/cards.
- Marcar como `posted`.
- Mover entre `Inbox` y `Plan`.

### Dejar fuera de V1

- Dashboard mensual completo.
- Charts avanzados.
- Vista `Account` tan densa como la actual.
- Sourcing multi-feed completo con tres sidebars paralelas.
- Gestión compleja de métricas históricas.

## Recomendación técnica

### Stack recomendado

`Expo + React Native`

Razones:

- El proyecto actual ya vive en JavaScript.
- Firebase Auth + Firestore se pueden reutilizar.
- Permite iOS y Android con una sola base.
- Facilita integrar share sheet, almacenamiento local y sync offline.

### Estructura recomendada

Crear un proyecto nuevo, separado del frontend actual:

- `maxx-tools/daily-tracker-mobile/`

Evitar meter la app móvil dentro del SPA actual. Debe vivir como producto separado.

### Regla técnica importante

Mantener compatibilidad de datos en V1, pero no compatibilidad de UI.

Eso significa:

- reutilizar Firestore y el shape general de datos al inicio
- crear una capa adaptadora móvil en vez de depender de `app.js`
- extraer después lógica compartible si vale la pena

## Arquitectura sugerida por capas

### Capa 1. Mobile app

- navegación
- pantallas
- componentes táctiles
- estado local y caché offline

### Capa 2. Domain layer

Crear una capa nueva con funciones puras para:

- transformar `ideas` a items de inbox
- transformar `schedule` a agenda diaria/semanal
- validar cards
- ordenar items
- mapear estados

Esta capa no debe depender del DOM ni de código del SPA actual.

### Capa 3. Data access

- Firebase Auth
- Firestore
- storage local para offline queue
- futuros endpoints si luego decidimos desacoplar más

## Riesgos y decisiones que hay que tomar temprano

### 1. Modelo de schedule

Hoy el schedule vive como mapa de fechas con arrays por slots. Eso funciona para escritorio, pero en móvil puede sentirse rígido.

Recomendación:

- en V1 mantener compatibilidad
- en la app móvil consumirlo mediante adaptadores
- si luego hace falta, migrar a un modelo más explícito por item

### 2. Captura desde móvil

Si no implementamos share sheet temprano, el producto móvil nace cojo.

### 3. Offline y latencia

Móvil necesita tolerancia a conexión inestable:

- lectura desde caché
- cola de acciones
- sync optimista

### 4. Alcance

El principal riesgo es intentar meter `Sourcing + Selection + Scheduler + Metrics + Account` completos en V1. Eso volvería a crear una mini app de escritorio y retrasaría la salida.

## Plan por fases

### Fase 0. Product definition

- Definir V1 exacto.
- Cerrar navegación móvil.
- Acordar qué queda desktop-only.
- Hacer wireframes de `Hoy`, `Inbox`, `Plan`, `Cuenta`.

### Fase 1. Foundation

- Crear repo/app `daily-tracker-mobile`.
- Configurar Expo, navegación, theming, Firebase.
- Implementar auth.
- Implementar lectura/escritura del documento actual de Firestore.
- Definir tipos y adaptadores de datos.

### Fase 2. Inbox + capture

- Crear modelo de `Inbox`.
- Alta manual de ideas.
- Importación desde share sheet.
- Acciones rápidas: guardar, archivar, planear, borrar.

### Fase 3. Today + planning

- Pantalla `Hoy`.
- Pantalla `Plan`.
- Programar por día.
- Reordenar dentro del día.
- Marcar `posted`.

### Fase 4. Sourcing lite

- Incorporar una vista simplificada de sourcing.
- En vez de mostrar todo, priorizar feed principal y acción `save to inbox`.

### Fase 5. Polish

- Offline improvements.
- Push/local notifications opcionales.
- Performance.
- QA real en dispositivos.

## Orden de ejecución recomendado

1. Diseñar la experiencia móvil y congelar alcance V1.
2. Crear app nueva separada.
3. Reutilizar auth y Firestore.
4. Construir `Inbox` y `Hoy` antes de intentar sourcing complejo.
5. Agregar share sheet antes del cierre de V1.

## Decisión recomendada

La decisión correcta no es “hacer responsive el Daily Tracker actual”.

La decisión correcta es:

- mantener backend y datos compatibles en una primera etapa
- crear una app móvil nueva
- rediseñar la experiencia alrededor de `capture -> inbox -> plan -> today`

## Siguientes pasos inmediatos

1. Confirmar que el producto móvil será `app separada` y no versión responsive.
2. Definir V1 con 4 tabs: `Hoy`, `Inbox`, `Plan`, `Cuenta`.
3. Diseñar wireframes de esas 4 vistas.
4. Crear `daily-tracker-mobile` con Expo.
5. Extraer un pequeño contrato de datos para no depender del monolito actual.
