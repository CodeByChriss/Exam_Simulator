# Exam Studio · biblioteca de exámenes

Incluye el simulador de las **101 preguntas** del PDF **DP-800-BATERIA-4**, de 234 páginas, y un editor para crear exámenes personales. La fuente del banco original es `dist/Examenpdf.pdf`. En la web de Netlify, todos los exámenes, incluido el DP-800, se pueden editar desde el editor compartido. Los archivos originales del PDF se conservan como referencia.

## Contraseña de entrada

La web de Netlify pide la contraseña compartida antes de servir la página, los archivos y la biblioteca. Se comprueba en el servidor; no se envía en el código del navegador. El acceso dura 24 horas mediante una cookie firmada HttpOnly y Secure en producción. La contraseña y la clave de firma se configuran mediante variables de entorno privadas; nunca deben subirse al repositorio. No hay usuarios ni roles internos: quienes entran pueden editar la biblioteca.

## Biblioteca compartida en Netlify

La web de producción es https://dp800v2.netlify.app/ . Cualquier visitante que haya introducido la contraseña puede crear, editar y eliminar exámenes y preguntas, sin cuentas ni roles dentro de la aplicación. El contenido se guarda en Netlify Blobs mediante una función del servidor y se conserva entre publicaciones. Las sesiones, respuestas e historial de notas permanecen en cada navegador.

Pulsa **Actualizar biblioteca** para recoger los cambios de otras personas; al abrir o recargar la web también se descargan. **Copiar enlace** genera un enlace directo al examen. El guardado rechaza cambios sobre una versión obsoleta si otra persona ya la ha modificado; el borrador se mantiene abierto.

Los exámenes creados con la versión antigua permanecen en el navegador en que se escribieron. Desde ese mismo navegador y dominio, utiliza **Compartir exámenes locales** para incorporarlos a la biblioteca común. También puedes exportarlos con la versión anterior e importar su copia. Una sesión ya iniciada conserva su versión de las preguntas.

### Ejecutar y publicar

Necesitas Node.js 22 o superior. Instala las dependencias con `npm install`, ejecuta `npm test` y después `npm run build`. Para una vista local con funciones y almacenamiento, copia `.env.example` como `.env`, elige valores de prueba y ejecuta `npx netlify dev`. El archivo `.env` se mantiene fuera de Git.

Configura `EXAMSTUDIO_PASSWORD` y `EXAMSTUDIO_SESSION_SECRET` como variables privadas del proyecto Netlify con alcance **Functions**; no las pongas en el código ni en `netlify.toml`. La segunda debe ser una cadena aleatoria larga. Si faltan, la aplicación bloquea el acceso. La biblioteca usa Netlify Blobs; las pruebas locales utilizan un almacén separado.

Para desplegar una copia, vincula tu propio proyecto con `npx netlify link`, comprueba sus variables y ejecuta `npm run deploy`. Este repositorio no despliega automáticamente en la web existente: antes de publicar desde él, quien administre Netlify debe configurar esas variables allí. La implementación existente usa valores privados distintos de los ejemplos de prueba.

Para contribuir mediante una pull request, consulta [CONTRIBUTING.md](CONTRIBUTING.md). El flujo de integración ejecuta las pruebas en cada PR.

## Importar exámenes VCE

En **Biblioteca / editor** hay dos botones: **Importar copia (JSON)** para las copias de ExamStudio e **Importar VCE** para exámenes de VCE Studio en versión 34. La conversión se hace en el navegador con Pyodide (Python compilado a WebAssembly) y el conversor `vce34_to_json.py`, que se sirve desde `dist/vendor`.

Usa el **Designer VERDE** de la carpeta **Player** (versión portable), no el Designer azul de clase. Si tienes un `.vce` creado con el azul, ábrelo con el verde y pulsa **Guardar**: se convierte automáticamente a v34 (cabecera `85 A8 03 04`). La pantalla comprueba los cuatro primeros bytes y muestra en rojo los ficheros que no son v34.

La primera conversión descarga el entorno de Python desde jsDelivr (unos 10-15 MB) y queda en la caché del navegador. Por eso la importación VCE necesita la web publicada o `npx netlify dev`; no funciona abriendo `dist/index.html` como archivo local.

La importación admite elección única y múltiple, hot area, drag & drop sobre imagen y las variantes de arrastre de VCE. Antes de subir nada se muestra un informe con las preguntas importadas, las imágenes detectadas y los avisos. Si alguna pregunta no se puede convertir, aparece como una entrada pulsable con su número de pregunta VCE, tipo, motivo y detalles del fichero original; nunca se omite una pregunta en silencio.

Las imágenes se guardan en el almacén `examstudio-assets` de Netlify Blobs. El conversor calcula su SHA-256 y el examen guarda URLs permanentes con la forma `/assets/<sha256>.<ext>`; no se incluye base64 en el JSON. Las lecturas de `/assets/*` son públicas para que los exámenes compartidos carguen sus imágenes, pero las subidas siguen exigiendo la cookie de acceso. En `npx netlify dev` se usa el mismo almacén local de Blobs.

El editor incluye un editor geométrico para hot area y drag & drop: permite dibujar, mover, redimensionar y eliminar zonas, marcar las correctas, cambiar la imagen principal y regenerar los recortes de los ítems. También conserva las imágenes incrustadas del enunciado, el caso de estudio, las opciones y la justificación al editar preguntas importadas.

## Crear y editar exámenes

Cada pregunta puede tener un **título opcional**, visible únicamente al gestionar las preguntas en el editor. El título se conserva al editar, duplicar, exportar e importar el examen, y no se muestra durante la sesión ni en la revisión. Las preguntas existentes sin título siguen mostrando una parte del enunciado en la lista.

Entra en **Biblioteca / editor** desde la cabecera o pulsa **Crear o editar exámenes** en el inicio.

1. Pulsa **Crear examen**, escribe un nombre y configura la duración opcional y el corte sobre 1000.
2. Pulsa **Añadir pregunta**. Elige elección única, múltiple, Yes/No simple, triple Yes/No, drag-and-drop o desplegables.
3. Escribe el enunciado, las opciones o apartados, la respuesta correcta y su justificación. Guarda la pregunta.
4. Pulsa **Volver a practicar**, selecciona el examen y elige Trainer o Normal.

Puedes editar el DP-800 compartido directamente o pulsar **Duplicar** para crear otro examen. Se pueden editar o eliminar preguntas y cambiar el nombre, duración y corte de los exámenes personales.

En drag-and-drop, escribe los valores disponibles uno por línea e indica la solución de cada apartado. En desplegables, cada apartado tiene su propia lista de opciones. Opcionalmente, puedes escribir texto o código con `[1]`, `[2]`… para colocar los huecos; de lo contrario se muestran sus etiquetas. El orden de estas interacciones es fijo.

Los exámenes se guardan en la biblioteca compartida. **Exportar copia** descarga un JSON; **Importar copia** crea otro examen compartido sin sobrescribir los demás. Guarda copias para conservar versiones anteriores.

Cada examen conserva una sesión y su historial por separado. Una sesión ya iniciada utiliza una copia de las preguntas, soluciones, duración y corte que tenía al empezar: las ediciones posteriores no cambian su evaluación. Los reintentos conservan esa misma versión. El temporizador de una sesión de otro examen se comprueba cuando vuelvas a seleccionarlo.

El editor admite hasta 1000 preguntas por examen; la capacidad total depende del espacio disponible en el navegador. Si no se puede guardar, muestra un error y conserva el último estado guardado. Este editor es de contenido manual; no extrae automáticamente preguntas de PDF.

## Formato Markdown

Las preguntas nuevas tienen activada la opción **Interpretar enunciado, respuestas y justificación como Markdown**. Puedes escribir Markdown directamente o pulsar **Cargar enunciado .md** para leer un archivo `.md` o `.markdown` de hasta 1 MB. El archivo carga únicamente el enunciado; las opciones, respuestas y justificación se definen en sus campos del editor. Si ya hay un enunciado escrito, se pide confirmar antes de reemplazarlo.

Se admiten tablas, títulos, listas, negrita, cursiva, citas, enlaces, código en línea y bloques de código con tres comillas invertidas. La vista previa se actualiza mientras escribes. El mismo formato se utiliza en la pregunta durante el examen y en su justificación. Las copias de seguridad conservan tanto el texto Markdown como su formato.

Las preguntas existentes de texto plano mantienen su formato hasta que actives Markdown al editarlas. El banco original del PDF conserva su representación anterior. Las opciones, valores arrastrables, afirmaciones y respuestas correctas también interpretan Markdown cuando la opción está activada. Los desplegables con Markdown usan un selector accesible que muestra el formato de cada opción. El Markdown no cambia las claves ni la puntuación. Para opciones de varias líneas en drag-and-drop o desplegables, separa los valores con una línea que contenga solo `---`; las tablas y los bloques de código quedan dentro de cada valor. El editor muestra una vista previa de las respuestas.

El analizador Marked 17.0.5 y su licencia se incluyen en `dist/vendor`, por lo que esta función también sirve sin conexión y en el alojamiento estático de Netlify. El HTML escrito dentro del Markdown se muestra como texto y se bloquean enlaces con protocolos ejecutables.

## Huecos integrados en la respuesta

Los desplegables y huecos de drag-and-drop se muestran compactos en la posición de [1], [2]… del campo **Texto o código de la zona de respuesta**. Los huecos también funcionan dentro de bloques Markdown con lenguaje como sql o python, conservando las líneas y la indentación. Los valores arrastrables aparecen como fichas y las opciones con Markdown se abren en una lista flotante para no desplazar el código.

## Casos de estudio

Los 17 casos de estudio del DP-800 aparecen plegados de forma predeterminada. Pulsa **Mostrar caso +** u **Ocultar caso −** para consultar el contexto; la pregunta y sus controles permanecen visibles. La sesión recuerda por pregunta si dejaste abierto el caso.

Para preguntas personales, utiliza el campo **Caso de estudio (opcional)** del editor y escribe la pregunta por separado en **Enunciado**. El caso también admite Markdown. Un enunciado Markdown completo puede separar ambas partes con los encabezados `# Caso de estudio` y `## Pregunta` (también `# Case study` y `## Question`). El contexto se conserva en las copias de seguridad.

## Uso

Abre `dist/index.html` en un navegador actual. No necesita instalación, servidor, claves ni servicios externos. Conserva toda la carpeta `dist` para que funcionen las soluciones y el PDF de consulta. También se publica como sitio privado de Sites.

1. Elige Trainer o Examen normal.
2. Activa opcionalmente el temporizador de 120 minutos.
3. Responde y entrega la sesión. Al terminar puedes revisar todas las preguntas o iniciar otro intento solo con las falladas.

El estado se guarda automáticamente en el navegador y dispositivo utilizados. Se conserva una sesión y los resultados de los últimos 20 intentos por examen; no se sincronizan entre dispositivos. El temporizador utiliza una fecha límite absoluta: sigue contando al cerrar la pestaña. Si vence mientras la página está cerrada, la sesión se entrega al volver a abrirla. Sin temporizador no existe límite.

## Comportamiento

- Trainer corrige inmediatamente la elección única y el Yes/No simple. En múltiple y preguntas con subapartados, corrige al enviar. Si la respuesta es completamente correcta, avanza automáticamente sin mostrar explicación. Los fallos y aciertos parciales muestran su corrección y justificación. Una respuesta corregida queda bloqueada. Al acertar la última pregunta, vuelve a una pendiente de envío si la hay; de lo contrario, muestra el resultado final.
- Normal guarda las respuestas y permite cambiarlas hasta entregar. No muestra corrección durante la sesión.
- Todas las sesiones y reintentos mezclan las preguntas. Las opciones de elección única, múltiple y Yes/No simple se mezclan y mantienen su orden durante la sesión. Las restantes conservan el orden del PDF.
- Drag-and-drop admite arrastre, selección con clic y controles de selección accesibles con teclado o móvil. Los valores pueden reutilizarse según el enunciado.
- Las parcialmente correctas y las no contestadas se incluyen entre las falladas para el reintento.

## Evaluación acordada

La batería completa tiene **177 puntos**:

| Interacción | Preguntas | Evaluación |
| --- | ---: | --- |
| Elección única | 45 | Un punto por respuesta correcta |
| Elección múltiple | 4 | Un punto por conjunto exacto; sin puntos por marcar todo |
| Yes/No simple | 8 | Un punto por respuesta correcta |
| Triple Yes/No | 10 | Un punto por subapartado |
| Drag-and-drop | 18 | Un punto por hueco |
| Desplegables | 16 | Un punto por hueco |

Nota = puntos obtenidos / puntos posibles × 1000. Se muestra el entero truncado y se aprueba cuando la proporción real alcanza el corte del examen (700/1000 en el banco original). Las no contestadas valen cero, sin penalización adicional. Los reintentos recalculan el denominador usando únicamente sus preguntas.

Esta es la normalización del simulador acordada con el usuario, no una reproducción de un algoritmo de puntuación escalada externo. El PDF declara corte 700 y duración 120 min.

## Fidelidad y discrepancias del PDF

Las tablas, código, pantallas y páginas rasterizadas de los enunciados se transcribieron a texto. Se reconstruyeron 44 áreas de respuesta como controles nativos. Las imágenes de solución se conservan para la revisión junto con las justificaciones en su idioma original. El PDF original se incluye para cotejar.

Cada pregunta conserva su número y rango de páginas. Las opciones mezcladas se evalúan por identificador estable; en la revisión se muestra el texto correcto y su letra de origen para evitar confundir letras mezcladas con las del PDF.

Se acordó priorizar la respuesta declarada en la justificación ante contradicciones internas:

- **16:** la solución resaltada indica `WHERE p.PatientId IN`; la justificación declara `WHERE EXISTS`. Se evalúa `WHERE EXISTS` y `WHERE p.PatientId = pr.PatientId`.
- **30:** las opciones están duplicadas dentro del caso práctico del propio PDF, con una variante en la opción D. Se conserva ese texto y se usan las opciones enumeradas del área de respuesta.
- **36:** la explicación escribe `git pr create`; el valor ofrecido y resaltado es `gh pr create`. Se utiliza el valor disponible y se señala la errata.
- **60:** el caso pide validar antes de fusionar; la clave y la justificación establecen `push`. Se conserva la clave del documento y se señala la incoherencia.

Las instrucciones originales sobre secciones no revisables se conservan como contenido del PDF. La navegación del simulador sigue la petición del usuario: revisión y reintento de preguntas de cualquier sección.

## Comprobaciones

`node --test tests.cjs catalog-tests.cjs markdown-tests.cjs case-study-tests.cjs shared-tests.cjs access-tests.cjs inline-tests.cjs` verifica integridad de las 101 preguntas, las claves, crédito parcial, selección exacta, aleatorización, puntuación y corte, reintentos, persistencia de fecha límite y existencia de recursos de solución. También comprueba creación y edición de exámenes, protección del banco original, copias de seguridad, importación validada, errores de almacenamiento, duración y corte personales y conservación de la versión de cada sesión. Las pruebas de Markdown cubren tablas, listas, títulos, código, protección frente a HTML ejecutable y conservación del formato al exportar e importar.

La revisión en navegador cubre ambos modos, envío, edición de respuestas en Normal, guardado y recuperación al recargar, corrección inmediata, controles de todos los tipos, revisión final y reintentos. Diseño comprobado en escritorio y vista móvil de 390 px, sin desbordamiento horizontal.

Las pruebas comprueban la cobertura y el funcionamiento de las preguntas incluidas.

SHA-256 del PDF: `65a3e17ca6e82bb1e5dd7cac0c291cbfca84abd7e5ab5691bf1c741651a029b8`.
