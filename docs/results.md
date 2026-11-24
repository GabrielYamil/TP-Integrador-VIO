# Resultados y estado de validación

Última actualización: **2026-11-23**.

Este informe reúne el estado de las fases 0 a 10. La Fase 7 fue validada en
escritorio con Foxglove Studio 3.6.0. La Fase 9 cuenta con una guía de pruebas
físicas, cuya ejecución está pendiente.

## Resumen

| Fase                           | Estado                        | Observación                                                                                      |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 — entorno y HTTPS            | **Completada**                | CA instalada en POCO X7 Pro; HTTPS LAN, `immersive-ar`, `local-floor` y sesión real verificados. |
| 1 — matemática y convenciones  | **Completada**                | 44 tests de matemática, convenciones, mensajes, mapa y cámara.                                   |
| 2 — relay y Foxglove           | **Completada**                | Simulador y telemetría real del POCO publicados en los cinco tópicos.                            |
| 3 — cliente AR y pose cruda    | **Completada en POCO X7 Pro** | Ejes dirigidos, tracking 100 %, buffer 0, 0 inválidos y deriva estacionaria de 1,7 mm.           |
| 4 — cámara e intrínsecos       | **Completada en POCO X7 Pro** | `camera-access`, textura real, gris a 10,2 Hz, intrínsecos estables y `hello` verificados.       |
| 5 — detección de marcadores    | **Completada**                | PnP físico a 60 cm, error −6,23 %, ejes coherentes y reproyección estable.                       |
| 6 — corrección de localización | **Completada**                | Tres modos y pose absoluta pasaron con un marcador de mapa controlado.                           |
| 7 — visualización Foxglove     | **Completada**                | Layout de tres paneles validado en Foxglove Studio 3.6.0 y telemetría móvil recibida.            |
| 8 — registro y evaluación      | **Completada**                | Corrida móvil cerrada grabada y analizada cuantitativamente.                                     |
| 9 — experimentos físicos       | **Completada en controlado**  | 21 ejecuciones: estrategias y cuatro condiciones con tres repeticiones.                          |
| 10 — documentación y entrega   | **Avanzada**                  | Informe, CSV, gráficos y guion listos; falta grabar el video/demo.                               |

La Fase 0 se cerró el **2026-11-22** con un POCO X7 Pro. La CA de `mkcert` se
instaló como CA de usuario, Chrome abrió `https://192.168.0.179:5173/` sin
advertencias y `/ar-test.html` confirmó `immersive-ar`, `local-floor`,
`camera-access`, 425 frames, textura de cámara de 864×1920 y ausencia de errores.
El reporte está en
[`evidence/poco-x7-pro-ar-test-2026-11-22.json`](evidence/poco-x7-pro-ar-test-2026-11-22.json).

La Fase 2 se verificó primero con el simulador y luego con telemetría real. El
relay móvil acumuló 3502 mensajes válidos (3497 `pose`, 5 `hello`) y 0 inválidos;
Foxglove se suscribió a los cinco tópicos.

La Fase 3 mostró tracking estable, conexión continua y buffer 0. Las pruebas
dirigidas confirmaron avance hacia `+world.x`, izquierda hacia `+world.y`,
altura hacia `+world.z` y yaw derecho sobre `-world.z`, con 100 % de tracking y
0 mensajes inválidos.

En la Fase 4, el POCO entregó una textura de 864×1920 y una imagen procesada de
288×640 a 10,2 Hz. La vista gris tuvo orientación correcta, los intrínsecos
`[487.7, 487.6, 144.0, 320.0]` permanecieron estables y se recibió `hello`.

## 2. Verificaciones automáticas

Última corrida documentada (2026-11-22, desde la raíz del repo):

| Comando             | Resultado                                         |
| :------------------ | :------------------------------------------------ |
| `pnpm typecheck`    | OK (`shared`, `client`, `server`).                |
| `pnpm test`         | 122 tests aprobados.                              |
| `pnpm lint`         | OK, sin errores.                                  |
| `pnpm build`        | OK (build multipágina en `packages/client/dist`). |
| `pnpm format:check` | OK (tras Prettier).                               |
| `git diff --check`  | OK.                                               |

### Detalle de los tests (122 total al 2026-11-23)

Desglose por paquete en la última ejecución:

packages/shared: 6 archivos, 44 tests.

packages/client: 9 archivos, 43 tests.

packages/server: 6 archivos, 35 tests.

Total: 21 archivos y 122 tests aprobados.

| Archivo                                                 | Tests | Cobertura principal                                                                       |
| :------------------------------------------------------ | :---: | :---------------------------------------------------------------------------------------- |
| `packages/shared/src/math/se3.test.ts`                  |  12   | Composición, inversa, rotaciones 90°, round-trip WebXR y corrección sintética con deriva. |
| `packages/shared/src/conventions/axes.test.ts`          |   6   | `C_WEBXR_CV`, `C_ROS_WEBXR`, `C_ROS_CV` e inversas.                                       |
| `packages/shared/src/markers/map.test.ts`               |   9   | Esquema del mapa, IDs duplicados, `markerPoseOnWall` y geometría del mapa demo.           |
| `packages/shared/src/messages/schemas.test.ts`          |   6   | Validación de `pose`, `marker`, `correction` y `hello`.                                   |
| `packages/shared/src/camera/intrinsics.test.ts`         |   8   | Intrínsecos, frustum asimétrico, origen top-left, escalado y errores.                     |
| `packages/shared/src/camera/calibration.test.ts`        |   3   | Esquema de calibración y escalado a imagen procesada.                                     |
| `packages/client/src/ws-client.test.ts`                 |   7   | Envío, buffer, descarte por límite/edad, backoff y cierre WS.                             |
| `packages/client/src/client-config.test.ts`             |   5   | Defaults, overrides (`hz`/`camhz`/`camw`/`preview`) y URL del relay.                      |
| `packages/client/src/camera-capture.test.ts`            |   5   | Tamaño de captura, aspect ratio y ausencia de `XRWebGLBinding`.                           |
| `packages/client/src/camera-calibration.test.ts`        |   4   | Carga, 404, error HTTP/red y validación de esquema.                                       |
| `packages/client/src/device-label.test.ts`              |   4   | Modelo Android y truncado a 256 chars.                                                    |
| `packages/client/src/marker-detector.test.ts`           |   3   | API real de OpenCV.js 5, AprilTag, `ArucoDetector`, `solvePnP` y reproyección.            |
| `packages/client/src/debug-overlay.test.ts`             |   2   | Proyección 3D→2D, contornos y ejes 3D en canvas.                                          |
| `packages/client/src/rate-limit-clock.test.ts`          |   6   | Reloj de envío estable ante jitter y saltos de frames.                                    |
| `packages/server/src/foxglove.test.ts`                  |   4   | ms→ns, JSON Schemas, TF, escena, métricas y snapshot inicial.                             |
| `packages/server/src/ingest.test.ts`                    |   2   | Mensajes válidos, inválidos y binarios; rechazo de otras rutas WS.                        |
| `packages/server/src/sim-client.test.ts`                |   7   | Argumentos, trayectorias círculo/cuadrado, deriva y `hello`.                              |
| `packages/server/src/camera-calibration-loader.test.ts` |   3   | Archivo ausente, calibración válida, JSON inválido y esquema inválido.                    |
| `packages/server/src/run-recorder.test.ts`              |  14   | Grabación JSONL, metadatos, cola, errores y cierre limpio.                                |
| `packages/server/src/run-analyzer.test.ts`              |   5   | Deriva, tasa, latencia, visibilidad, checkpoints, validación y CSV.                       |

El caso sintético de corrección construye una observación de un marcador, introduce una deriva conocida en T_odom_cam y comprueba que T_world_odom se recupera con error menor a 1e-6. También verifica que la pose corregida de la cámara coincide con la pose verdadera.

El test de integración de Foxglove levanta un FoxgloveServer en un puerto efímero, conecta un FoxgloveClient, se suscribe a los cinco canales y verifica el contenido de /pose/raw, /pose/corrected, /tf, /markers y /metrics. Incluye una pose sin corrected para comprobar el uso de T_WORLD_ODOM_INITIAL.

Los tests de IngestClient usan un WebSocket falso y timers simulados. Cubren el envío directo, el buffer hasta la apertura, el descarte del mensaje más viejo al superar el límite, el descarte por antigüedad, el backoff exponencial con jitter, el cierre definitivo y el fallo del constructor de WebSocket.

Los tests de la Fase 4 cubren la matemática de intrínsecos con un frustum simétrico y otro asimétrico, el reflejo de cy al origen top-left, el escalado a la resolución procesada, el esquema de la calibración opcional, el tamaño de captura con relación de aspecto (incluida una imagen vertical), la carga y los errores del endpoint de calibración, la etiqueta del dispositivo y el connectionId que dispara el reenvío de hello.

## 3. Verificación del servidor HTTPS

El **2026-11-06** se instaló `mkcert` 1.4.4. El **2026-11-22** se regeneró el
certificado para incluir la IP LAN `192.168.0.179`, se instaló la CA de usuario
en Android y se crearon reglas de firewall privadas para TCP 5173, 8443 y 8765,
limitadas a la subred local.

| Prueba                                                | Resultado                                         |
| :---------------------------------------------------- | :------------------------------------------------ |
| `https://localhost:8443/health`                       | HTTP 200, `status: ok`, `tls: true`.              |
| `https://127.0.0.1:8443/health` (verificación TLS)    | HTTP 200, certificado válido.                     |
| `/` y assets JS/CSS en `:8443`                        | HTTP 200.                                         |
| `/ar.html`, `/ar-test.html` y `/mock.html` en `:8443` | HTTP 200 en las tres rutas.                       |
| Vite en `https://localhost:5173/`                     | HTTP 200.                                         |
| Proxy `/health` de Vite → `:8443`                     | HTTP 200 con `tls: true`.                         |
| `pnpm dev` (cliente + servidor)                       | Ambos iniciaron y sirvieron las 4 páginas.        |
| Relay `wss://localhost:8443/ingest`                   | 37 válidos, 0 inválidos; CA de `mkcert` aceptada. |

Chrome Android abrió `https://192.168.0.179:5173/` sin advertencias, detectó el
contexto seguro e inició una sesión `immersive-ar`. El relay `/ingest` aceptó la
telemetría del teléfono por la IP LAN. Si la dirección de la PC cambia, hay que
regenerar el certificado y verificar que la nueva IP figure en sus SAN.

## 4. Verificación de la Fase 2

### 4.1. Prueba local con simulador

Se inició el servidor en modo HTTP para escritorio, utilizando los puertos temporales 18443 (ingesta) y 18765 (Foxglove).

Se ejecutó el simulador con una trayectoria cuadrada, deriva artificial y una tasa de 20 Hz:

pnpm --filter @vio/server exec tsx src/sim-client.ts --url ws://127.0.0.1:18443/ingest --trajectory square --rate 20 --duration 3 --drift --device "Sim Test"

El servidor cargó el mapa de seis marcadores y anunció los cinco canales de Foxglove: /tf, /pose/raw, /pose/corrected, /markers y /metrics.

Resultados observados:

| Comprobación                 | Resultado                                 |
| :--------------------------- | :---------------------------------------- |
| Conexión a `/ingest`         | OK; cliente identificado como `Sim Test`. |
| Mensajes recibidos           | 54 (1 `hello` + 53 `pose`).               |
| Mensajes válidos / inválidos | 54 válidos / 0 inválidos.                 |
| Cierre                       | `code=1000`, `reason=sim done`.           |
| Servidor Foxglove            | Escuchando en `ws://0.0.0.0:18765`.       |
| Canales anunciados           | Los 5 canales esperados.                  |

Esta prueba verificó el camino simulador → /ingest → gateway → FoxgloveServer. No abrió Foxglove Studio; la visualización se validó por separado en la sección 4.3.

### 4.2. Cobertura automática de la Fase 2

ingest.test.ts: acepta mensajes válidos, descarta JSON inválido, mensajes incompletos y binarios, y rechaza conexiones a otra ruta.

foxglove.test.ts: anuncia los canales con esquema, publica poses, transformadas, escena y métricas, y respeta T_WORLD_ODOM_INITIAL cuando no hay pose corregida.

sim-client.test.ts: valida los argumentos y la geometría de las trayectorias sintéticas.

### 4.3. Validación visual en Foxglove Studio 3.5.0

El 2026-11-05 se conectó Foxglove Studio 3.5.0 por Foxglove WebSocket a ws://localhost:8765, con el servidor en modo --http en el puerto 8443 y el simulador en círculo con deriva a 20 Hz.

| Comprobación                          | Resultado                                                                |
| :------------------------------------ | :----------------------------------------------------------------------- |
| Conexión Foxglove WebSocket           | OK.                                                                      |
| Tópicos visibles                      | `/tf`, `/pose/raw`, `/pose/corrected`, `/markers` y `/metrics`.          |
| Marco `world` y árbol de TF           | Visible (`world` → `odom` → `camera`).                                   |
| Marcadores del mapa                   | 6 cubos con etiquetas ID 0 a ID 5.                                       |
| Trayectorias                          | Verde corregida en `world` y roja cruda en `odom`, separadas por deriva. |
| `/metrics`                            | FPS ~20 y latencia de procesamiento visible.                             |
| `visible_markers` y `last_correction` | Vacío y `null` (sin detecciones en el simulador).                        |

No se adjuntó una captura de pantalla en esta corrida; la confirmación visual fue reportada por el usuario. La versión de Foxglove Studio se obtuvo del registro de programas instalados de Windows.

Con esto se cumplió el criterio de aceptación de la Fase 2. El 2026-11-06 también se verificó el relay con el servidor HTTPS real: el simulador usó wss://localhost:8443/ingest y la CA de mkcert sin --insecure.

La validación posterior de la Fase 7 se documenta en la sección 8.4. El
2026-11-22 también se recibió telemetría real del POCO: 3502 mensajes válidos,
0 inválidos, 3497 `pose` y 5 `hello`.

## 5. Verificación de la Fase 3

### 5.1. Alcance implementado

packages/client/ar.html y packages/client/src/ar.ts: pantalla de inicio, comprobación de HTTPS e immersive-ar, sesión con dom-overlay, local-floor con fallback a local y camera-access como feature opcional.

Conversión de cada XRViewerPose a odom con poseFromWebXRMatrix y envío de mensajes pose a poseHz (30 Hz por defecto). El mensaje no incluye corrected; el servidor usa T_WORLD_ODOM_INITIAL.

Overlay con tracking, FPS, estado del relay, mensajes enviados, buffer, camera-access y posición cruda/corregida para diagnóstico.

packages/client/src/ws-client.ts: reconexión con backoff exponencial y jitter, buffer máximo de 120 mensajes, edad máxima de 3 s y descarte de los mensajes más viejos.

packages/client/src/client-config.ts: overrides ?hz=1..60 y ?ingest=ws://...|wss://... para pruebas. La comprobación de soporte tiene un timeout de 5 s para que la UI no quede en consultando si isSessionSupported no responde.

### 5.2. Prueba de integración del payload

El 2026-11-07 se levantó el servidor con `pnpm start` y se conectó un WebSocket
de Node a `wss://localhost:8443/ingest` usando `certs/rootCA.pem` como CA. Se
envió un mensaje idéntico al del cliente, sin `hello`:

```json
{
  "type": "pose",
  "t": 1794000000000,
  "raw": { "p": [0, 1.4, 0], "q": [0, 0, 0, 1] },
  "tracking": "tracking"
}
```

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

La prueba móvil del **2026-11-22** verificó tracking a 27–30 FPS, buffer 0,
movimiento fluido en Foxglove y una prueba estacionaria de unos 30 s:

| Comprobación         | Resultado               |
| -------------------- | ----------------------- |
| Inicio estacionario  | `[0.048, 1.201, 0.002]` |
| Fin estacionario     | `[0.047, 1.202, 0.001]` |
| Desplazamiento total | 1,7 mm                  |
| Captura              | 10,2 Hz                 |
| Mensajes inválidos   | 0                       |

Las capturas están en
[`evidence/poco-x7-pro-stationary-start-2026-11-22.jpeg`](evidence/poco-x7-pro-stationary-start-2026-11-22.jpeg)
y
[`evidence/poco-x7-pro-stationary-end-2026-11-22.jpeg`](evidence/poco-x7-pro-stationary-end-2026-11-22.jpeg).
El **2026-11-23** se completaron cuatro corridas dirigidas:

| Movimiento  | Resultado principal                                      |
| ----------- | -------------------------------------------------------- |
| Avance      | `Δworld ≈ [1,65, -0,07, 0,00] m`                         |
| Izquierda   | `Δworld ≈ [0,20, 1,65, 0,01] m`                          |
| Altura      | `Δworld ≈ [-0,05, 0,00, 0,55] m`                         |
| Yaw derecho | `91,84°` alrededor de un eje `≈ [0,016, -0,005, -1,000]` |

Todas las corridas tuvieron tracking 100 % y 0 mensajes inválidos. Con cámara a
1 Hz y preview desactivado, la tasa de pose fue 26,55 Hz; con captura a 10 Hz
fue 21,76 Hz, por lo que el procesamiento de cámara sigue siendo el principal
límite de rendimiento. Evidencia estructurada:
[`evidence/poco-x7-pro-physical-tests-2026-11-23.json`](evidence/poco-x7-pro-physical-tests-2026-11-23.json).

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

| Comando             | Resultado                                     |
| :------------------ | :-------------------------------------------- |
| `pnpm typecheck`    | OK en los tres paquetes.                      |
| `pnpm test`         | 15 archivos, 85 tests pasan.                  |
| `pnpm lint`         | OK.                                           |
| `pnpm build`        | OK (`/ar.html` y assets de Fase 4 generados). |
| `pnpm format:check` | OK.                                           |

También se levantó el servidor con pnpm start y se consultó el endpoint:

| Prueba                                           | Resultado                                            |
| :----------------------------------------------- | :--------------------------------------------------- |
| `GET /config/camera_intrinsics.json` sin archivo | HTTP 404, `{"error":"camera_intrinsics_not_found"}`. |
| `/health` sin archivo                            | `camera_intrinsics.available: false`, `error: null`. |
| Endpoint con `camera_intrinsics.example.json`    | HTTP 200 con `image_size` e `intrinsics`.            |
| `/health` con archivo                            | `camera_intrinsics.available: true`, `error: null`.  |
| Procesos al terminar                             | Sin listeners en 8443 ni 8765.                       |

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

El criterio principal se cumplió en el POCO X7 Pro el **2026-11-22**:

| Comprobación      | Resultado                                       |
| ----------------- | ----------------------------------------------- |
| Raw Camera Access | `camera-access` habilitado y textura disponible |
| Textura           | 864×1920                                        |
| Imagen procesada  | 288×640 en gris a 10,2 Hz                       |
| Orientación       | Correcta y coherente con la escena              |
| Intrínsecos       | `[487.7, 487.6, 144.0, 320.0]`, fuente `XRView` |
| Inicio de sesión  | `hello` recibido                                |

La captura está en
[`evidence/poco-x7-pro-client-live-2026-11-22.jpeg`](evidence/poco-x7-pro-client-live-2026-11-22.jpeg).
La calibración propia queda como opción si la prueba física de PnP exige mayor
precisión.

## 7. Verificación de la Fase 5

El **2026-11-23** se mostró un AprilTag 36h11 ID 0 en una pantalla con margen
blanco. El POCO X7 Pro cargó OpenCV.js 5 en el Web Worker y transmitió 882
mensajes `marker` durante 107,45 s (8,21 observaciones/s):

| Métrica                | Resultado                                                       |
| ---------------------- | --------------------------------------------------------------- |
| IDs observados         | 882 del ID 0                                                    |
| Error de reproyección  | media 0,326 px; mediana 0,290 px; p90 0,562 px; máximo 2,092 px |
| Distancia PnP estimada | media 0,629 m; rango 0,466–0,717 m                              |

Esto valida detección, decodificación, esquinas, PnP y transmisión móvil. La
validación métrica posterior usó un patrón negro de 16 cm, una distancia medida
de 60 cm y los intrínsecos derivados de XRView. Sobre 134 observaciones estimó
56,26 cm (error −6,23 %), con reproyección mediana de 0,280 px y máxima de
0,700 px. Los signos de los ejes X, Y y Z también fueron coherentes. Durante la
prueba se corrigieron la dependencia de OpenCV.js 5, su API ArUco real, la
selección de buffers 32/64-bit, la carga comprimida del worker y el contador del
overlay.

### 7.1. Validación de corrección absoluta de la Fase 6

Se cargó un mapa físico controlado con el marcador ID 0 a 1,20 m del piso y el
origen directamente debajo de su centro. Con la lente medida a 1,20 m de altura
y 0,60 m delante del marcador, la posición esperada era
`[0,000, 0,600, 1,200] m`. Sobre 206 poses, 79 observaciones del marcador y 79
correcciones aceptadas, la mediana corregida fue `[0,023, 0,627, 1,154] m`:
2,3 cm de error lateral, 2,7 cm en profundidad, −4,6 cm en altura y 5,8 cm de
error 3D. La reproyección mediana fue 0,559 px. Junto con las pruebas de Directo,
Suavizado y Off, esto cierra la Fase 6 en el mapa controlado.

## 8. Herramientas y artefactos

### 8.1. Marcadores

pnpm markers generó:

6 PNG de 1890 × 1890 px a 300 DPI;

un PDF A4 de 6 páginas;

patrón de 16,0 cm de lado, zona de silencio de 2,0 cm y regla de control de 10,0 cm.

El PDF y los PNG son artefactos ignorados por git; se regeneran con el comando anterior. No se validó la impresión física ni el tamaño medido con regla.

### 8.2. Mapa demo

pnpm map:demo generó config/marker_map.json para una sala de 4 × 3 × 2,5 m con 6 marcadores. Los tests comprueban que las poses coinciden con markerPoseOnWall. El mapa es sintético: no se midió una sala real.

### 8.3. Servidor

El servidor actual:

sirve el build de packages/client/dist;

expone GET /health con el estado de la ingesta y de Foxglove;

usa HTTPS por defecto en el puerto 8443;

monta el relay /ingest sobre el mismo servidor;

valida los mensajes con zod y descarta los inválidos;

publica /tf, /pose/raw, /pose/corrected, /markers y /metrics en ws://IP_DE_LA_PC:8765;

acepta --http para pruebas de escritorio;

incluye pnpm sim y el cliente móvil /ar.html como fuentes de telemetría.

### 8.4. Validación del layout en Foxglove Studio 3.6.0

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

La importación del layout se validó con datos sintéticos y, en una sesión
posterior, Foxglove recibió los cinco tópicos de la telemetría real del POCO.
Esto no demuestra todavía detección real de AprilTags ni corrección física.

## 9. Verificación automática de la Fase 8

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

También se implementó `tools/analyze_run.ts`:

```powershell
pnpm analyze -- data/runs/<corrida>.jsonl
```

Produce `metrics.json`, `trajectory.csv` y `checkpoints.csv` con error de cierre,
frecuencia de pose, latencia media/p50/p95/máxima, porcentaje de tracking,
estimación de tiempo con marcadores visibles y errores en puntos de control.
La ventana de visibilidad predeterminada es 250 ms y puede cambiarse con
`--visibility-ms`.

El **2026-11-23** se grabó y analizó una corrida móvil cerrada real en modo
`off`, alejándose aproximadamente 1 m y regresando al punto inicial:

| Métrica                       | Resultado |
| ----------------------------- | --------- |
| Duración                      | 27,21 s   |
| Poses                         | 724       |
| Frecuencia                    | 26,57 Hz  |
| Tracking                      | 100 %     |
| Visibilidad del marcador      | 86,19 %   |
| Error de cierre crudo         | 26,96 cm  |
| Retorno físico según AprilTag | ≈1,4 cm   |

La referencia independiente del AprilTag confirma que el celular volvió casi
al mismo punto; por eso el error de cierre representa principalmente deriva de
la odometría cruda y no una diferencia de colocación. El analizador generó
localmente `metrics.json`, `trajectory.csv` y `checkpoints.csv`. La latencia de
aproximadamente 1,03 s contiene un offset casi constante entre los relojes del
cliente y el servidor y no debe interpretarse como latencia de red aislada.

El 2026-11-22 se ejecutaron nuevamente las verificaciones automatizadas:

| Comando             | Resultado                     |
| :------------------ | :---------------------------- |
| `pnpm typecheck`    | OK.                           |
| `pnpm test`         | 122 tests aprobados en total. |
| `pnpm lint`         | OK.                           |
| `pnpm build`        | OK.                           |
| `pnpm format:check` | OK.                           |
| `git diff --check`  | OK.                           |

El paquete `@vio/server` pasó 35 tests: 14 del grabador JSONL y 5 del analizador,
además de las pruebas existentes de relay, Foxglove, calibración y simulador.

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

## 10. Verificaciones manuales

- [x] Certificados generados, reglas de firewall creadas y CA instalada en Android.
- [x] Chrome Android abre la IP LAN sin advertencias.
- [x] `/ar-test.html` inicia `immersive-ar` y se guardó el reporte JSON.
- [x] `/ar.html` muestra tracking, FPS, cámara y conexión al relay.
- [x] La pose llega a `/health`, `/pose/raw` y `/tf` con buffer 0.
- [x] La pose se ve fluida en Foxglove cerca de 30 FPS.
- [x] `camera-access` entrega textura y gris a ≥10 Hz con orientación correcta.
- [x] Los intrínsecos son estables y el servidor recibe `hello`.
- [x] El layout de Foxglove 3.6.0 se importó y validó en escritorio.
- [x] Aislar avance, giro y altura para confirmar los signos de los ejes.
- [x] Detectar un AprilTag ID 0 y medir error de reproyección y distancia estimada.
- [x] Validar PnP con un tamaño físico conocido (16 cm a 60 cm; error −6,23 %).
- [x] Comparar los modos `off`, `direct` y `smooth` con recorridos repetibles.
- [x] Grabar y analizar una corrida móvil real.
- [x] Completar las repeticiones de la Fase 9 en el montaje físico controlado.

### Cómo registrar el resultado

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

La prueba de Foxglove del 2026-11-05 quedó registrada en la sección 4.3 con la versión 3.5.0. La validación posterior del layout de tres paneles con Foxglove Studio 3.6.0 quedó registrada en la sección 8.4. Para futuras corridas, agregar una captura del panel 3D con las dos trayectorias.

No modificar los resultados automáticos sin volver a ejecutar los comandos.

## 10.1. Resultados físicos de la Fase 9

Se completaron tres recorridos cerrados por estrategia y tres repeticiones para
cada condición variable. El cierre corregido de `direct` y `smooth` se calculó
sobre ventanas estables posteriores a la primera relocalización.

| Estrategia | Cierre crudo mediano | Cierre corregido mediano |
| ---------- | -------------------- | ------------------------ |
| Off        | 5,83 cm              | 5,83 cm                  |
| Directo    | 3,39 cm              | 4,49 cm                  |
| Suavizado  | 2,36 cm              | 4,71 cm                  |

En este recorrido corto, las correcciones no mejoraron todas las repeticiones:
cuando la deriva cruda ya era pequeña, el ruido de PnP y la colocación manual
podían dominar el cierre. Directo mejoró su primera corrida de 13,56 a 7,87 cm.

Las condiciones de 1,20 m, ángulo aproximado de 45° e iluminación ambiente baja
mantuvieron tracking 100 % y detecciones estables. La oclusión de aproximadamente
25 % produjo cero detecciones y correcciones en las tres sesiones, aunque WebXR
conservó tracking 100 %.

Los datos consolidados están en
[`evidence/phase9-strategy-summary.csv`](evidence/phase9-strategy-summary.csv),
[`evidence/phase9-condition-summary.csv`](evidence/phase9-condition-summary.csv)
y el [`informe final`](final-report.md).

## 11. Limitaciones conocidas

1. La validación móvil se realizó en un solo modelo, POCO X7 Pro; no demuestra
   compatibilidad con todos los Android compatibles con ARCore.
2. `camera-access` funcionó en el dispositivo probado, pero sigue siendo una
   feature opcional en WebXR.
3. El emulador de Android Studio no implementa WebXR.
4. El mapa versionado sigue siendo sintético; la validación física usó un mapa
   local medido de un marcador, no una sala multimarcador.
5. Los intrínsecos derivados se validaron a 60 cm y mostraron un error de
   −6,23 %; no se realizó calibración propia porque quedó dentro de ±10 %.
6. La Fase 9 se completó en un montaje controlado de un marcador; una sala
   completa con múltiples marcadores queda como trabajo de generalización.
7. `@foxglove/ws-protocol` 0.8.0 está deprecado, pero se mantiene por decisión
   del proyecto.

## 12. Próximo paso

1. Grabar el video/demo siguiendo `docs/video-demo-script.md`.
2. Opcionalmente repetir en una sala multimarcador.

Las fases 0 a 9 están cerradas para el entorno probado. La Fase 10 tiene informe,
resultados y gráficos completos; queda pendiente la grabación del video/demo.
