# Resultados y estado de validación

Última actualización: 2026-11-22.

Alcance de este informe: Fase 0 (entorno, HTTPS y prueba AR), Fase 1 (matemática SE(3) y convenciones), Fase 2 (relay y Foxglove), Fase 3 (cliente WebXR y pose cruda), Fase 4 (imagen de cámara e intrínsecos), Fase 5 (detección de marcadores y PnP), Fase 6 (corrección de localización), Fase 7 (visualización en Foxglove), Fase 8 (registro de recorridos), Fase 9 (experimentos físicos) y Fase 10 (documentación final).

La Fase 7 fue validada en escritorio con Foxglove Studio 3.6.0. La Fase 8 está implementada y validada mediante una corrida sintética. La Fase 9 cuenta con una guía de pruebas físicas, cuya ejecución está pendiente. La Fase 10 corresponde al cierre y actualización de la documentación.

## Resumen

| Fase | Estado | Observación |
| :--- | :--- | :--- |
| **0 — entorno y HTTPS** | Parcial | El circuito en PC está verificado. La aceptación depende de la prueba en un celular real, que sigue pendiente. |
| **1 — matemática y convenciones** | Completada | El paquete `shared` incluye las pruebas de matemática $SE(3)$, convenciones y geometría. |
| **2 — relay y Foxglove** | Completada | Relay y servidor Foxglove verificados. Prueba visual con Foxglove Studio 3.5.0 el 2026-11-05 y relay HTTPS el 2026-11-06. |
| **3 — cliente AR y pose cruda** | Implementada | Cliente WebXR y transporte implementados y testeados. Falta validar en celular la fluidez, el tracking y los ejes. |
| **4 — cámara e intrínsecos** | Implementada | Captura, conversión a gris, vista previa e intrínsecos implementados. Endpoint verificado en PC; falta la validación en celular. |
| **5 — detección de marcadores** | Implementada | Web Worker con OpenCV.js, AprilTag 36h11, PnP IPPE Square, debug 3D y mensajes `marker`. Falta validación física. |
| **6 — corrección de localización** | Implementada | Módulo `LocalizationCorrector`, estrategias Directa (A) y Suavizada (B), filtrado de outliers, selector UI/URL y mensajes `correction`. Falta validación física. |
| **7 — visualización en Foxglove** | Validada en escritorio | Layout de tres paneles, mapa con seis marcadores, transforms y datos del simulador. |
| **8 — registro de recorridos** | Completada | Grabador JSONL validado con una corrida sintética. |
| **9 — experimentos físicos** | Preparada; pendiente | Guía creada. Falta ejecutar las pruebas con un celular compatible con ARCore. |
| **10 — documentación** | En curso | Actualización del README, resultados, guías y evidencias finales. |

La Fase 0 no se declara cerrada hasta que Chrome Android acepte el certificado e inicie una sesión immersive-ar con tracking. En esta máquina no hay un celular conectado. El 2026-11-06 se instaló mkcert, se generaron los certificados y se verificó HTTPS local; falta instalar la CA en Android y repetir la prueba desde el teléfono.

La Fase 2 se implementó a pedido explícito, sin esperar el cierre de la Fase 0. Su criterio de aceptación se cumplió: Foxglove Studio mostró el marco world, los seis marcadores del mapa y la cámara moviéndose con la trayectoria sintética. La validación móvil pendiente no invalida el relay, pero sí impide considerar cerrada la Fase 0.

La Fase 3 también se implementó a pedido explícito. El cliente /ar.html abre una sesión immersive-ar, convierte la pose de WebXR a odom y la envía a aproximadamente 30 Hz por el relay. El transporte tiene reconexión con backoff, buffer acotado y descarte de mensajes viejos. La validación en celular no se pudo ejecutar: no hay un dispositivo ARCore disponible, así que el criterio de aceptación de la fase sigue pendiente.

La Fase 4 se implementó a pedido explícito, sin esperar la aceptación de la Fase 3. El cliente captura la textura de camera-access, la reduce en GPU a un framebuffer de 640 px de lado máximo, la convierte a gris con origen arriba a la izquierda y muestra una vista previa. Los intrínsecos se derivan de XRView.projectionMatrix o se cargan de config/camera_intrinsics.json, y se envían en hello al abrir la conexión y después de cada reconexión. El 2026-11-07 se verificaron en la PC los tests y el endpoint de calibración (404 sin archivo, 200 con el ejemplo). La captura real, la orientación de la imagen y la estabilidad de los intrínsecos no se validaron en celular, así que el criterio de aceptación sigue pendiente.

## 2. Verificaciones automáticas

Última corrida documentada (2026-11-22, desde la raíz del repo):

| Comando | Resultado |
| :--- | :--- |
| `pnpm typecheck` | OK (`shared`, `client`, `server`). |
| `pnpm test` | 110 tests aprobados. |
| `pnpm lint` | OK, sin errores. |
| `pnpm build` | OK (build multipágina en `packages/client/dist`). |
| `pnpm format:check` | OK (tras Prettier). |
| `git diff --check` | OK. |

### Detalle de los tests (110 total al 2026-11-22)

Desglose por paquete en la última ejecución:

packages/shared: 6 archivos, 44 tests.

packages/client: 8 archivos, 36 tests.

packages/server: 5 archivos, 30 tests.

Total: 19 archivos y 110 tests aprobados.

| Archivo | Tests | Cobertura principal |
| :--- | :---: | :--- |
| `packages/shared/src/math/se3.test.ts` | 12 | Composición, inversa, rotaciones 90°, round-trip WebXR y corrección sintética con deriva. |
| `packages/shared/src/conventions/axes.test.ts` | 6 | `C_WEBXR_CV`, `C_ROS_WEBXR`, `C_ROS_CV` e inversas. |
| `packages/shared/src/markers/map.test.ts` | 9 | Esquema del mapa, IDs duplicados, `markerPoseOnWall` y geometría del mapa demo. |
| `packages/shared/src/messages/schemas.test.ts` | 6 | Validación de `pose`, `marker`, `correction` y `hello`. |
| `packages/shared/src/camera/intrinsics.test.ts` | 8 | Intrínsecos, frustum asimétrico, origen top-left, escalado y errores. |
| `packages/shared/src/camera/calibration.test.ts` | 3 | Esquema de calibración y escalado a imagen procesada. |
| `packages/client/src/ws-client.test.ts` | 7 | Envío, buffer, descarte por límite/edad, backoff y cierre WS. |
| `packages/client/src/client-config.test.ts` | 5 | Defaults, overrides (`hz`/`camhz`/`camw`/`preview`) y URL del relay. |
| `packages/client/src/camera-capture.test.ts` | 5 | Tamaño de captura, aspect ratio y ausencia de `XRWebGLBinding`. |
| `packages/client/src/camera-calibration.test.ts` | 4 | Carga, 404, error HTTP/red y validación de esquema. |
| `packages/client/src/device-label.test.ts` | 4 | Modelo Android y truncado a 256 chars. |
| `packages/client/src/marker-detector.test.ts` | 2 | AprilTag, `ArucoDetector`, `solvePnP` y filtros de error. |
| `packages/client/src/debug-overlay.test.ts` | 2 | Proyección 3D→2D, contornos y ejes 3D en canvas. |
| `packages/server/src/foxglove.test.ts` | 4 | ms→ns, JSON Schemas, TF, escena, métricas y snapshot inicial. |
| `packages/server/src/ingest.test.ts` | 2 | Mensajes válidos, inválidos y binarios; rechazo de otras rutas WS. |
| `packages/server/src/sim-client.test.ts` | 7 | Argumentos, trayectorias círculo/cuadrado, deriva y `hello`. |
| `packages/server/src/camera-calibration-loader.test.ts` | 3 | Archivo ausente, calibración válida, JSON inválido y esquema inválido. |
| `packages/server/src/run-recorder.test.ts` | 14 | Grabación JSONL, metadatos, cola, errores y cierre limpio. |

El caso sintético de corrección construye una observación de un marcador, introduce una deriva conocida en T_odom_cam y comprueba que T_world_odom se recupera con error menor a 1e-6. También verifica que la pose corregida de la cámara coincide con la pose verdadera.

El test de integración de Foxglove levanta un FoxgloveServer en un puerto efímero, conecta un FoxgloveClient, se suscribe a los cinco canales y verifica el contenido de /pose/raw, /pose/corrected, /tf, /markers y /metrics. Incluye una pose sin corrected para comprobar el uso de T_WORLD_ODOM_INITIAL.

Los tests de IngestClient usan un WebSocket falso y timers simulados. Cubren el envío directo, el buffer hasta la apertura, el descarte del mensaje más viejo al superar el límite, el descarte por antigüedad, el backoff exponencial con jitter, el cierre definitivo y el fallo del constructor de WebSocket.

Los tests de la Fase 4 cubren la matemática de intrínsecos con un frustum simétrico y otro asimétrico, el reflejo de cy al origen top-left, el escalado a la resolución procesada, el esquema de la calibración opcional, el tamaño de captura con relación de aspecto (incluida una imagen vertical), la carga y los errores del endpoint de calibración, la etiqueta del dispositivo y el connectionId que dispara el reenvío de hello.

## 3. Verificación del servidor HTTPS

El **2026-11-06** se instaló `mkcert` 1.4.4 (`winget`) y se corrió `pnpm cert:setup` para `localhost`, `127.0.0.1`, `::1` y las IPv4 LAN (`192.168.1.18`, `192.168.56.1`, `172.19.144.1`), dejando la CA en `certs/rootCA.pem` lista para instalar en Android.

| Prueba | Resultado |
| :--- | :--- |
| `https://localhost:8443/health` | HTTP 200, `status: ok`, `tls: true`. |
| `https://127.0.0.1:8443/health` (verificación TLS) | HTTP 200, certificado válido. |
| `/` y assets JS/CSS en `:8443` | HTTP 200. |
| `/ar.html`, `/ar-test.html` y `/mock.html` en `:8443` | HTTP 200 en las tres rutas. |
| Vite en `https://localhost:5173/` | HTTP 200. |
| Proxy `/health` de Vite → `:8443` | HTTP 200 con `tls: true`. |
| `pnpm dev` (cliente + servidor) | Ambos iniciaron y sirvieron las 4 páginas. |
| Relay `wss://localhost:8443/ingest` | 37 válidos, 0 inválidos; CA de `mkcert` aceptada. |

Lo que falta verificar

La prueba anterior demuestra que el servidor y Vite hablan HTTPS y que el relay acepta wss con la CA de mkcert en Windows, pero no demuestra que la CA esté instalada en Android ni que Chrome Android la acepte. Para cerrar la Fase 0 hay que instalar certs/rootCA.pem en el celular, crear las reglas de firewall (la consola no estaba elevada) y abrir la URL desde el teléfono.

El relay /ingest sobre HTTPS ya se probó con un certificado real: el simulador se conectó a wss://localhost:8443/ingest usando certs/rootCA.pem como CA y envió 37 mensajes válidos sin errores.

## 4. Verificación de la Fase 2

### 4.1. Prueba local con simulador

Se inició el servidor en modo HTTP para escritorio, utilizando los puertos temporales 18443 (ingesta) y 18765 (Foxglove).

Se ejecutó el simulador con una trayectoria cuadrada, deriva artificial y una tasa de 20 Hz:

 pnpm --filter @vio/server exec tsx src/sim-client.ts --url ws://127.0.0.1:18443/ingest --trajectory square --rate 20 --duration 3 --drift --device "Sim Test"

  El servidor cargó el mapa de seis marcadores y anunció los cinco canales de Foxglove: /tf, /pose/raw, /pose/corrected, /markers y /metrics.

 Resultados observados:
 | Comprobación | Resultado |
| :--- | :--- |
| Conexión a `/ingest` | OK; cliente identificado como `Sim Test`. |
| Mensajes recibidos | 54 (1 `hello` + 53 `pose`). |
| Mensajes válidos / inválidos | 54 válidos / 0 inválidos. |
| Cierre | `code=1000`, `reason=sim done`. |
| Servidor Foxglove | Escuchando en `ws://0.0.0.0:18765`. |
| Canales anunciados | Los 5 canales esperados. |

Esta prueba verificó el camino simulador → /ingest → gateway → FoxgloveServer. No abrió Foxglove Studio; la visualización se validó por separado en la sección 4.3.

 ### 4.2. Cobertura automática de la Fase 2

ingest.test.ts: acepta mensajes válidos, descarta JSON inválido, mensajes incompletos y binarios, y rechaza conexiones a otra ruta.

foxglove.test.ts: anuncia los canales con esquema, publica poses, transformadas, escena y métricas, y respeta T_WORLD_ODOM_INITIAL cuando no hay pose corregida.

sim-client.test.ts: valida los argumentos y la geometría de las trayectorias sintéticas.

 ### 4.3. Validación visual en Foxglove Studio 3.5.0

El 2026-11-05 se conectó Foxglove Studio 3.5.0 por Foxglove WebSocket a ws://localhost:8765, con el servidor en modo --http en el puerto 8443 y el simulador en círculo con deriva a 20 Hz.

| Comprobación | Resultado |
| :--- | :--- |
| Conexión Foxglove WebSocket | OK. |
| Tópicos visibles | `/tf`, `/pose/raw`, `/pose/corrected`, `/markers` y `/metrics`. |
| Marco `world` y árbol de TF | Visible (`world` → `odom` → `camera`). |
| Marcadores del mapa | 6 cubos con etiquetas ID 0 a ID 5. |
| Trayectorias | Verde corregida en `world` y roja cruda en `odom`, separadas por deriva. |
| `/metrics` | FPS ~20 y latencia de procesamiento visible. |
| `visible_markers` y `last_correction` | Vacío y `null` (sin detecciones en el simulador). |

No se adjuntó una captura de pantalla en esta corrida; la confirmación visual fue reportada por el usuario. La versión de Foxglove Studio se obtuvo del registro de programas instalados de Windows.

Con esto se cumplió el criterio de aceptación de la Fase 2. El 2026-11-06 también se verificó el relay con el servidor HTTPS real: el simulador usó wss://localhost:8443/ingest y la CA de mkcert sin --insecure.

La validación posterior de la Fase 7 se documenta en la sección 7.4, utilizando Foxglove Studio 3.6.0 y el layout versionado en foxglove/layout.json. La telemetría desde un celular compatible continúa pendiente.

## 5. Verificación de la Fase 3

### 5.1. Alcance implementado

packages/client/ar.html y packages/client/src/ar.ts: pantalla de inicio, comprobación de HTTPS e immersive-ar, sesión con dom-overlay, local-floor con fallback a local y camera-access como feature opcional.

Conversión de cada XRViewerPose a odom con poseFromWebXRMatrix y envío de mensajes pose a poseHz (30 Hz por defecto). El mensaje no incluye corrected; el servidor usa T_WORLD_ODOM_INITIAL.

Overlay con tracking, FPS, estado del relay, mensajes enviados, buffer, camera-access y posición cruda/corregida para diagnóstico.

packages/client/src/ws-client.ts: reconexión con backoff exponencial y jitter, buffer máximo de 120 mensajes, edad máxima de 3 s y descarte de los mensajes más viejos.

packages/client/src/client-config.ts: overrides ?hz=1..60 y ?ingest=ws://...|wss://... para pruebas. La comprobación de soporte tiene un timeout de 5 s para que la UI no quede en consultando si isSessionSupported no responde.

### 5.2. Prueba de integración del payload

El 2026-11-07 se levantó el servidor con pnpm start y se conectó un WebSocket de Node a wss://localhost:8443/ingest usando certs/rootCA.pem como CA. Se envió un mensaje idéntico al del cliente, sin hello:

{
  "type": "pose",
  "t": 1794000000000,
  "raw": { "p": [0, 1.4, 0], "q": [0, 0, 0, 1] },
  "tracking": "tracking"
}

/health registró 1 mensaje recibido, 1 válido, 0 inválidos, 0 hello y 1 pose. Esto confirma que el relay acepta el mensaje de la Fase 3 y que el cliente no necesita hello para enviar poses. No valida WebXR ni el movimiento real: eso requiere el celular.

También el 2026-11-07 se cargó /ar.html en Chrome headless contra el servidor compilado. La página mostró HTTPS: sí, Relay: conectado y, tras el timeout de 5 s, immersive-ar: no soportado; no hubo errores JavaScript. Esto verifica el arranque de la página y el WebSocket, no el soporte real de WebXR (el flag --ignore-certificate-errors se usó solo para el smoke test local).

### 5.3. Cobertura automática de la Fase 3

ws-client.test.ts prueba con un WebSocket falso y timers simulados:

envío directo cuando el socket está abierto;

buffer y vaciado en orden al abrir;

descarte del mensaje más viejo al superar el límite;

descarte por antigüedad al reconectar;

backoff exponencial con jitter y reinicio del intento al abrir;

cierre definitivo sin reconexión;

reconexión cuando el constructor de WebSocket falla.

### 5.4. Criterio de aceptación

El criterio de la Fase 3 —caminar con el celular y ver la pose moverse de forma fluida en Foxglove, con los ejes correctos— no se puede verificar sin un dispositivo ARCore. Queda pendiente y no se declara cumplido. Las pruebas automáticas y de relay solo cubren el transporte y el formato del mensaje.

## 6. Verificación de la Fase 4

### 6.1. Alcance implementado

packages/shared/src/camera/intrinsics.ts: derivación de fx, fy, cx, cy, skew desde XRView.projectionMatrix; origen configurable bottom-left/top-left; escalado por ejes y a un tamaño destino.

packages/shared/src/camera/calibration.ts: esquema zod de config/camera_intrinsics.json, validación y escalado a la imagen procesada sin reflejar cy.

packages/client/src/camera-capture.ts: binding de XRWebGLBinding, framebuffer propio, shader que invierte v, readPixels RGBA, conversión a gris top-left, cálculo de intrínsecos y buffer reutilizable.

packages/client/src/camera-calibration.ts: descarga y validación de la calibración; distingue ok, missing (404), invalid y error.

packages/client/src/device-label.ts: extracción del modelo de Android para hello, con recorte a 256 caracteres.

packages/client/src/ar.ts: integración de la captura a cameraHz, vista previa, overlay de cámara/intrínsecos/hello, degradación a solo VIO cuando camera-access o XRWebGLBinding no están disponibles, y limpieza de la sesión.

packages/client/src/client-config.ts: maxDimension (640 px), captureHz (10 Hz), preview y calibrationUrl, con overrides ?camhz=, ?camw= y ?preview=.

packages/server/src/camera-calibration-loader.ts y index.ts: carga opcional al arrancar, validación zod, endpoint GET /config/camera_intrinsics.json y campos en /health.

packages/client/vite.config.ts: proxy de /config/camera_intrinsics.json hacia el servidor HTTPS.

### 6.2. Verificación en la PC

El 2026-11-07 se ejecutaron los checks del repositorio:

| Comando | Resultado |
| :--- | :--- |
| `pnpm typecheck` | OK en los tres paquetes. |
| `pnpm test` | 15 archivos, 85 tests pasan. |
| `pnpm lint` | OK. |
| `pnpm build` | OK (`/ar.html` y assets de Fase 4 generados). |
| `pnpm format:check` | OK. |

También se levantó el servidor con pnpm start y se consultó el endpoint:

| Prueba | Resultado |
| :--- | :--- |
| `GET /config/camera_intrinsics.json` sin archivo | HTTP 404, `{"error":"camera_intrinsics_not_found"}`. |
| `/health` sin archivo | `camera_intrinsics.available: false`, `error: null`. |
| Endpoint con `camera_intrinsics.example.json` | HTTP 200 con `image_size` e `intrinsics`. |
| `/health` con archivo | `camera_intrinsics.available: true`, `error: null`. |
| Procesos al terminar | Sin listeners en 8443 ni 8765. |

La calibración de ejemplo se copió temporalmente a config/camera_intrinsics.json y se eliminó al terminar; el archivo local sigue ignorado por git.

### 6.3. Cobertura automática de la Fase 4

intrinsics.test.ts: frustum simétrico, frustum asimétrico con skew, viewport con offset, reflejo de cy, escalado y rechazo de matrices o viewports inválidos.

calibration.test.ts: esquema estricto, campos opcionales y escalado a 640×360.

camera-capture.test.ts: reducción preservando aspecto, imágenes verticales, dimensiones mínimas y ausencia de XRWebGLBinding.

camera-calibration.test.ts: 200 válido, 404, 503, error de red, JSON inválido y esquema inválido.

device-label.test.ts: modelo de Android, sufijo wv, fallback a Chrome y truncado.

client-config.test.ts: defaults y overrides de cámara, incluidos los warnings por valores fuera de rango.

camera-calibration-loader.test.ts: archivo ausente, válido, JSON inválido y esquema inválido.

### 6.4. Criterio de aceptación

El criterio de la Fase 4 —ver la imagen en gris a ≥10 Hz con orientación correcta y disponer de intrínsecos utilizables— no se puede verificar sin un celular con camera-access. Queda pendiente. Las pruebas de la PC solo demuestran la matemática, el empaquetado, la configuración y el endpoint; no demuestran que Chrome Android entregue la textura ni que la orientación sea la esperada en un dispositivo concreto.

## 7. Herramientas y artefactos

### 7.1. Marcadores

pnpm markers generó:

6 PNG de 1890 × 1890 px a 300 DPI;

un PDF A4 de 6 páginas;

patrón de 16,0 cm de lado, zona de silencio de 2,0 cm y regla de control de 10,0 cm.

El PDF y los PNG son artefactos ignorados por git; se regeneran con el comando anterior. No se validó la impresión física ni el tamaño medido con regla.

### 7.2. Mapa demo

pnpm map:demo generó config/marker_map.json para una sala de 4 × 3 × 2,5 m con 6 marcadores. Los tests comprueban que las poses coinciden con markerPoseOnWall. El mapa es sintético: no se midió una sala real.

### 7.3. Servidor

El servidor actual:

sirve el build de packages/client/dist;

expone GET /health con el estado de la ingesta y de Foxglove;

usa HTTPS por defecto en el puerto 8443;

monta el relay /ingest sobre el mismo servidor;

valida los mensajes con zod y descarta los inválidos;

publica /tf, /pose/raw, /pose/corrected, /markers y /metrics en ws://IP_DE_LA_PC:8765;

acepta --http para pruebas de escritorio;

incluye pnpm sim y el cliente móvil /ar.html como fuentes de telemetría.

### 7.4. Validación del layout en Foxglove Studio 3.6.0

El 2026-11-22 se realizó una nueva validación visual en escritorio con Foxglove Studio 3.6.0, utilizando el servidor local en modo HTTP y el simulador de trayectorias.

Se comprobó lo siguiente:

Conexión mediante Foxglove WebSocket a ws://localhost:8765.

Visualización del mapa con los seis marcadores, IDs 0 a 5.

Visualización de los transforms respecto del marco world.

Recepción de datos en los paneles Plot y Raw Messages.

Visualización de la trayectoria sintética al iniciar el simulador.

Actividad de las métricas durante la simulación.

El layout foxglove/layout.json contiene tres paneles:

3D: marco world, transforms /tf y marcadores /markers.

Plot: delta_p_m, delta_angle_rad y fps.

Raw Messages: mensajes del tópico /metrics.

La distribución ocupa aproximadamente el 65 % del espacio para 3D y el 35 % restante para la columna derecha, dividida entre Plot y Raw Messages.

Durante la prueba se comprobó que el layout personal denominado Layout mostraba los tres paneles simultáneamente. La opción Default for ws://localhost:8765 mostraba una disposición diferente. Por lo tanto, se conservó el layout personal con la distribución validada.

La validación corresponde al circuito de escritorio con datos sintéticos. No demuestra detección real de AprilTags ni localización con cámara ARCore. Tampoco se adjuntó una captura de pantalla como evidencia.

## 8. Verificación automática de la Fase 8

La grabación JSONL de la Fase 8 quedó implementada como una extensión opcional del servidor. Se activa exclusivamente con --record y no modifica el flujo del servidor sin esa opción.

El grabador conserva los mensajes validados por Zod, separa el timestamp message.t del timestamp context.received_at_ms y añade server_time_ms al momento de generación de cada registro. Los metadatos iniciales incluyen el servidor, el mapa completo cargado y una copia de la calibración validada, si existe.

Cobertura incluida:

escritura de run_start, cuatro tipos de mensajes válidos y run_end;

conservación separada de los timestamps de cliente y recepción;

copia de calibración válida en los metadatos;

límite de cola y estado incompleto por overflow;

fallo de inicialización sin impedir la creación del servidor;

contadores separados dropped_before_queue y dropped_after_queue;

escritura serial e inFlight sin contabilización duplicada;

publicación atómica de manifiesto y ausencia de manifiesto ante errores;

cierre de JSONL confirmado antes de publicar el manifiesto.

El 2026-11-22 se ejecutaron nuevamente las verificaciones automatizadas:

| Comando | Resultado |
| :--- | :--- |
| `pnpm typecheck` | OK. |
| `pnpm test` | 110 tests aprobados en total. |
| `pnpm lint` | OK. |
| `pnpm build` | OK. |
| `pnpm format:check` | OK. |
| `git diff --check` | OK. |

El paquete @vio/server pasó 30 tests, incluyendo 14 pruebas del grabador JSONL.

El 2026-11-21 se realizó también una prueba manual de integración local:

El servidor se inició con --record --http.

El simulador se conectó por WebSocket.

Se utilizó una trayectoria circular con deriva.

El dispositivo reportado fue Sim-Test.

El simulador envió 79 mensajes pose.

Se registraron 80 mensajes válidos en total, incluido el mensaje hello.

Se generó un archivo JSONL de 46.874 bytes.

Se generó un manifiesto de 636 bytes.

El JSONL contiene 82 registros:

1 run_start;

80 client_message;

1 run_end.

written_records: 80.

dropped_records: 0.

write_errors: 0.

run_start_written: true.

run_end_written: true.

jsonl_closed: true.

Estado del manifiesto: complete.

El cierre se realizó mediante SIGINT.

Esta prueba valida el circuito de grabación con datos sintéticos, pero no demuestra la integración con ARCore, WebXR ni hardware Android real. No se probaron fallos reales de disco ni permisos del sistema de archivos.

## 9. Verificaciones manuales pendientes

Las siguientes pruebas no se pueden hacer sin un celular compatible con ARCore. Quedan registradas como pendientes, no como aprobadas. La validación de Foxglove Studio en escritorio ya se documentó en la sección 7.4.

pnpm cert:setup ejecutado y certificados generados con mkcert.

/health responde por HTTPS con tls: true y certificado válido.

El relay acepta wss:// con la CA de mkcert y mensajes válidos.

Reglas de firewall para TCP 5173, 8443 y 8765 creadas en PowerShell elevado.

Instalación de rootCA.pem como CA de usuario en Android.

https://IP_DE_LA_PC:5173/ abre en Chrome Android sin advertencias.

La página de inicio detecta contexto seguro y servidor disponible.

/ar-test.html inicia una sesión immersive-ar en el celular.

/ar.html inicia la sesión y muestra tracking, FPS y estado del relay en el overlay.

La sesión entrega tracking y FPS estables.

La pose cruda del celular llega por wss:// al relay y aparece en /health, /pose/raw y /tf (odom → camera).

Caminar hacia adelante mueve el marco en la dirección esperada de world; los giros y el movimiento vertical son coherentes.

La pose se ve fluida en Foxglove a una frecuencia cercana a 30 Hz.

camera-access se habilita y getCameraImage devuelve una textura.

La vista previa en gris se ve a ≥10 Hz y con orientación correcta.

Los intrínsecos del overlay son estables y corresponden a la imagen procesada.

El servidor recibe hello (byType.hello > 0) con el dispositivo y image_size correctos.

Con una calibración propia, /ar.html muestra Fuente: calibración y los valores escalados.

El modo mock abre la webcam en la PC y la pose simulada responde al teclado.

Se guardó el reporte JSON de /ar-test.html como evidencia.

El endpoint /config/camera_intrinsics.json responde 404 sin archivo y 200 con una calibración válida (verificado en la PC el 2026-11-07).

Cómo registrar el resultado

En /ar-test.html, presionar Copiar reporte y pegar el JSON en una sección nueva de este documento, indicando:

modelo de celular;

versión de Android y de Chrome;

versión de Google Play Services for AR;

fecha y hora de la prueba;

resultado de enabledFeatures;

errores observados.

Para la Fase 3, registrar además el estado del overlay de /ar.html, el valor de ingest.messagesValid en /health y una captura de Foxglove con /pose/raw, /tf y la trayectoria cruda.

Para la Fase 4, registrar además:

tamaño procesado de la imagen y frecuencia de captura del overlay;

valores de intrínsecos y fuente (XRView o calibración);

captura de la vista previa en gris, indicando si la orientación es correcta;

byType.hello, ingest.devices y el image_size recibido en /health;

si se usó config/camera_intrinsics.json, su image_size y el valor de camera_intrinsics.available en /health.

La prueba de Foxglove del 2026-11-05 quedó registrada en la sección 4.3 con la versión 3.5.0. La validación posterior del layout de tres paneles con Foxglove Studio 3.6.0 quedó registrada en la sección 7.4. Para futuras corridas, agregar una captura del panel 3D con las dos trayectorias.

No modificar los resultados automáticos sin volver a ejecutar los comandos.

## 10. Limitaciones conocidas

Validación móvil bloqueada: no hay un celular ARCore conectado en el entorno de desarrollo actual.

camera-access: es una feature opcional y puede no estar disponible en el dispositivo. Si falla, la Fase 4 queda bloqueada; no se puede resolver con tests unitarios.

Emulador: el emulador de Android Studio no implementa WebXR.

Mapa sintético: las poses de los marcadores no provienen de una sala real y no se comprobó la orientación física.

Fase 3: el cliente y el transporte están implementados y testeados, pero la fluidez, el tracking y la orientación de los ejes no se validaron en un celular real. El criterio de aceptación sigue pendiente.

Fase 4: la captura, la conversión a gris, la calibración y el hello están implementados y testeados, pero la textura real, la orientación de la imagen y la estabilidad de los intrínsecos no se validaron en un celular. El criterio de aceptación sigue pendiente.

Foxglove Studio: se validó visualmente en escritorio con la versión 3.5.0 el 2026-11-05 y posteriormente con la versión 3.6.0 el 2026-11-22. También se comprobó el layout personal de tres paneles. Sigue pendiente la telemetría real del celular y no se adjuntó una captura de evidencia.

Relay HTTPS: validado con wss://localhost:8443/ingest y la CA de mkcert. Falta repetirlo desde el celular por la IP LAN.

mkcert: instalado y con certificados generados; la CA todavía no está instalada en Android y las reglas de firewall requieren una consola elevada.

@foxglove/ws-protocol 0.8.0: está deprecado; se usa igual por la decisión del proyecto y se revisará si aparece un problema de compatibilidad.

## 11. Próximo paso

Completar la preparación del entorno Android: instalar certs/rootCA.pem como CA de usuario y configurar las reglas de firewall.

Ejecutar las verificaciones pendientes de las Fases 0, 3, 4, 5 y 6 con un celular compatible con ARCore.

Realizar los experimentos físicos de la Fase 9 siguiendo docs/phase-9-physical-tests.md, comparando los modos off, direct y smooth, con al menos tres repeticiones por condición.

Registrar los resultados y las limitaciones observadas, sin confundir las corridas sintéticas con las mediciones físicas.

Completar la documentación final de la Fase 10.

El desarrollo de escritorio, la visualización en Foxglove y la grabación sintética ya fueron validados. Las pruebas físicas pendientes requieren un dispositivo Android compatible.