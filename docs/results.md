# Resultados y estado de validación

Última actualización: **2026-11-07**.

Alcance de este informe: **Fase 0 (entorno, HTTPS y prueba AR)**, **Fase 1
(matemática SE(3) y convenciones)**, **Fase 2 (relay y Foxglove)**, **Fase 3
(cliente WebXR y pose cruda)** y **Fase 4 (imagen de cámara e intrínsecos)**. Las
fases 5 a 10 todavía no se implementaron.

## 1. Resumen

| Fase                          | Estado           | Observación                                                                                                      |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| 0 — entorno y HTTPS           | **Parcial**      | El circuito PC está verificado. La aceptación depende de la prueba en celular real, que sigue pendiente.         |
| 1 — matemática y convenciones | **Completada**   | El paquete `shared` acumula 44 tests, incluido el caso sintético de corrección.                                  |
| 2 — relay y Foxglove          | **Completada**   | 13 tests originales del servidor (16 actuales). Foxglove Studio 3.5.0 el 2026-11-05 y relay HTTPS el 2026-11-06. |
| 3 — cliente AR y pose cruda   | **Implementada** | 7 tests originales del cliente (25 actuales). Falta validar en celular la fluidez, el tracking y los ejes.       |
| 4 — cámara e intrínsecos      | **Implementada** | Captura, gris, preview, intrínsecos y `hello`. Endpoint verificado en PC; falta la validación en celular.        |

La Fase 0 no se declara cerrada hasta que Chrome Android acepte el certificado
e inicie una sesión `immersive-ar` con tracking. En esta máquina no hay un
celular conectado. El 2026-11-06 se instaló `mkcert`, se generaron los
certificados y se verificó HTTPS local; falta instalar la CA en Android y
repetir la prueba desde el teléfono.

La Fase 2 se implementó a pedido explícito, sin esperar el cierre de la Fase 0.
Su criterio de aceptación se cumplió: Foxglove Studio mostró el marco `world`,
los seis marcadores del mapa y la cámara moviéndose con la trayectoria
sintética. La validación móvil pendiente no invalida el relay, pero sí impide
considerar cerrada la Fase 0.

La Fase 3 también se implementó a pedido explícito. El cliente `/ar.html` abre
una sesión `immersive-ar`, convierte la pose de WebXR a `odom` y la envía a
~30 Hz por el relay. El transporte tiene reconexión con backoff, buffer acotado
y descarte de mensajes viejos. La validación en celular no se pudo ejecutar:
no hay un dispositivo ARCore disponible, así que el criterio de aceptación de
la fase sigue **pendiente**.

La Fase 4 se implementó a pedido explícito, sin esperar la aceptación de la
Fase 3. El cliente captura la textura de `camera-access`, la reduce en GPU a un
framebuffer de 640 px de lado máximo, la convierte a gris con origen arriba a
la izquierda y muestra una vista previa. Los intrínsecos se derivan de
`XRView.projectionMatrix` o se cargan de `config/camera_intrinsics.json`, y se
envían en `hello` al abrir la conexión y después de cada reconexión. El
2026-11-07 se verificaron en la PC los tests y el endpoint de calibración
(404 sin archivo, 200 con el ejemplo). La captura real, la orientación de la
imagen y la estabilidad de los intrínsecos **no se validaron en celular**, así
que el criterio de aceptación sigue **pendiente**.

## 2. Verificaciones automáticas

Ejecutadas desde la raíz del repositorio:

| Comando             | Resultado                                                              |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck`    | OK en `shared`, `client` y `server`.                                   |
| `pnpm test`         | 15 archivos, **85 tests pasaron** (44 shared + 25 client + 16 server). |
| `pnpm lint`         | OK, sin errores.                                                       |
| `pnpm build`        | OK. El cliente multipágina se generó en `packages/client/dist`.        |
| `pnpm format:check` | OK después de aplicar Prettier.                                        |

### Detalle de los tests

| Archivo                                                 | Tests | Cobertura principal                                                                         |
| ------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------- |
| `packages/shared/src/math/se3.test.ts`                  |    12 | Composición, inversa, rotaciones de 90°, round-trip WebXR, corrección sintética con deriva. |
| `packages/shared/src/conventions/axes.test.ts`          |     6 | `C_WEBXR_CV`, `C_ROS_WEBXR`, `C_ROS_CV` y sus inversas.                                     |
| `packages/shared/src/markers/map.test.ts`               |     9 | Esquema del mapa, IDs duplicados, `markerPoseOnWall` y geometría del mapa demo.             |
| `packages/shared/src/messages/schemas.test.ts`          |     6 | Validación de mensajes `pose`, `marker`, `correction` y `hello`.                            |
| `packages/shared/src/camera/intrinsics.test.ts`         |     8 | Derivación de intrínsecos, frustum asimétrico, origen top-left, escalado y errores.         |
| `packages/shared/src/camera/calibration.test.ts`        |     3 | Esquema de calibración y escalado a la imagen procesada.                                    |
| `packages/client/src/ws-client.test.ts`                 |     7 | Envío, buffer, descarte por límite/edad, backoff y cierre del cliente WebSocket.            |
| `packages/client/src/client-config.test.ts`             |     5 | Defaults, overrides `hz`/`camhz`/`camw`/`preview` y URL del relay.                          |
| `packages/client/src/camera-capture.test.ts`            |     5 | Tamaño de captura, relación de aspecto y ausencia de `XRWebGLBinding`.                      |
| `packages/client/src/camera-calibration.test.ts`        |     4 | Carga, 404, error HTTP/red y validación del esquema de calibración.                         |
| `packages/client/src/device-label.test.ts`              |     4 | Extracción del modelo de Android y recorte a 256 caracteres.                                |
| `packages/server/src/foxglove.test.ts`                  |     4 | Conversión ms→ns, canales JSON Schema, TF, escena, métricas y snapshot al suscribirse.      |
| `packages/server/src/ingest.test.ts`                    |     2 | Mensajes válidos, inválidos y binarios; rechazo de otra ruta WebSocket.                     |
| `packages/server/src/sim-client.test.ts`                |     7 | Argumentos, trayectorias círculo/cuadrado, deriva y mensaje `hello`.                        |
| `packages/server/src/camera-calibration-loader.test.ts` |     3 | Archivo ausente, calibración válida, JSON inválido y esquema inválido.                      |

El caso sintético de corrección construye una observación de un marcador,
introduce una deriva conocida en `T_odom_cam` y comprueba que
`T_world_odom` se recupera con error menor a `1e-6`. También verifica que la
pose corregida de la cámara coincide con la pose verdadera.

El test de integración de Foxglove levanta un `FoxgloveServer` en un puerto
efímero, conecta un `FoxgloveClient`, se suscribe a los cinco canales y verifica
el contenido de `/pose/raw`, `/pose/corrected`, `/tf`, `/markers` y `/metrics`.
Incluye una pose sin `corrected` para comprobar el uso de
`T_WORLD_ODOM_INITIAL`.

Los tests de `IngestClient` usan un WebSocket falso y timers simulados. Cubren
el envío directo, el buffer hasta la apertura, el descarte del mensaje más viejo
al superar el límite, el descarte por antigüedad, el backoff exponencial con
jitter, el cierre definitivo y el fallo del constructor de WebSocket.

Los tests de la Fase 4 cubren la matemática de intrínsecos con un frustum
simétrico y otro asimétrico, el reflejo de `cy` al origen top-left, el escalado
a la resolución procesada, el esquema de la calibración opcional, el tamaño de
captura con relación de aspecto (incluida una imagen vertical), la carga y los
errores del endpoint de calibración, la etiqueta del dispositivo y el
`connectionId` que dispara el reenvío de `hello`.

## 3. Verificación del servidor HTTPS

El **2026-11-06** se instaló `mkcert` 1.4.4 con `winget` y se ejecutó
`pnpm cert:setup`. Se generaron certificados para `localhost`, `127.0.0.1`,
`::1` y las IPv4 LAN detectadas (`192.168.1.18`, `192.168.56.1` y
`172.19.144.1`). La CA quedó en `certs/rootCA.pem`, lista para instalar en
Android. El servidor y Vite se validaron de nuevo con estos certificados.

| Prueba                                               | Resultado                                                 |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `https://localhost:8443/health`                      | HTTP 200, `status: ok`, `tls: true`.                      |
| `https://127.0.0.1:8443/health` con verificación TLS | HTTP 200, certificado válido.                             |
| `/` en `:8443`                                       | HTTP 200.                                                 |
| `/ar.html` en `:8443`                                | HTTP 200.                                                 |
| `/ar-test.html` en `:8443`                           | HTTP 200.                                                 |
| `/mock.html` en `:8443`                              | HTTP 200.                                                 |
| Assets JS/CSS del build                              | HTTP 200.                                                 |
| Vite en `https://localhost:5173/`                    | HTTP 200.                                                 |
| Proxy `/health` de Vite hacia `:8443`                | HTTP 200 con `tls: true`.                                 |
| `pnpm dev` con cliente y servidor                    | Ambos procesos arrancaron y sirvieron las cuatro páginas. |
| Relay `wss://localhost:8443/ingest`                  | 37 mensajes válidos, 0 inválidos; CA de mkcert aceptada.  |

### Lo que falta verificar

La prueba anterior demuestra que el servidor y Vite hablan HTTPS y que el relay
acepta `wss` con la CA de mkcert en Windows, pero **no** demuestra que la CA esté
instalada en Android ni que Chrome Android la acepte. Para cerrar la Fase 0 hay
que instalar `certs/rootCA.pem` en el celular, crear las reglas de firewall (la
consola no estaba elevada) y abrir la URL desde el teléfono.

El relay `/ingest` sobre HTTPS ya se probó con un certificado real: el simulador
se conectó a `wss://localhost:8443/ingest` usando `certs/rootCA.pem` como CA y
envió 37 mensajes válidos sin errores.

## 4. Verificación de la Fase 2

### 4.1. Prueba local con simulador

Se levantó el servidor en modo HTTP de escritorio con puertos temporales:

```powershell
pnpm --filter @vio/server exec tsx src/index.ts --http --port 18443 --foxglove-port 18765 --log-level debug
```

El servidor cargó el mapa de 6 marcadores, abrió Foxglove en `:18765` y anunció
los canales `/tf`, `/pose/raw`, `/pose/corrected`, `/markers` y `/metrics` con
encoding JSON y JSON Schema. Luego se ejecutó el simulador:

```powershell
pnpm --filter @vio/server exec tsx src/sim-client.ts --url ws://127.0.0.1:18443/ingest --trajectory square --rate 20 --duration 3 --drift --device "Sim Test"
```

Resultados observados:

| Comprobación                | Resultado                                                    |
| --------------------------- | ------------------------------------------------------------ |
| Conexión al relay `/ingest` | OK; el log registró el cliente y el `hello` como `Sim Test`. |
| Mensajes recibidos          | 54 (1 `hello` + 53 `pose`).                                  |
| Mensajes válidos            | 54.                                                          |
| Mensajes inválidos          | 0.                                                           |
| Cierre de la conexión       | `code=1000, reason=sim done`.                                |
| Servidor Foxglove           | Escuchando en `ws://0.0.0.0:18765`.                          |
| Canales anunciados          | Los cinco canales esperados.                                 |

Esta prueba no abrió Foxglove Studio; verificó el camino
`simulador → /ingest → gateway → FoxgloveServer`. La decodificación de los
mensajes Foxglove y el contenido de los payloads están cubiertos por el test de
integración.

### 4.2. Cobertura automática de la Fase 2

- `ingest.test.ts`: acepta mensajes válidos, descarta JSON inválido, mensajes
  incompletos y binarios, y rechaza conexiones a otra ruta.
- `foxglove.test.ts`: anuncia los canales con esquema, publica poses,
  transformadas, escena y métricas, y respeta `T_WORLD_ODOM_INITIAL` cuando no
  hay pose corregida.
- `sim-client.test.ts`: valida los argumentos y la geometría de las trayectorias
  sintéticas.

### 4.3. Validación visual en Foxglove Studio

El **2026-11-05** se conectó Foxglove Studio **3.5.0** por **Foxglove
WebSocket** a `ws://localhost:8765`, con el servidor en modo `--http` en el
puerto 8443 y el simulador en círculo con deriva a 20 Hz.

| Comprobación                                        | Resultado                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| Conexión Foxglove WebSocket                         | OK.                                                                         |
| Tópicos visibles                                    | `/tf`, `/pose/raw`, `/pose/corrected`, `/markers` y `/metrics`.             |
| Marco `world` y árbol de TF                         | Visible, con `world → odom → camera`.                                       |
| Marcadores del mapa                                 | Los 6 cubos con etiquetas `ID 0` a `ID 5`.                                  |
| Trayectorias                                        | Verde corregida en `world` y roja cruda en `odom`, separadas por la deriva. |
| `/metrics`                                          | FPS cercano a 20 y latencia de procesamiento visible.                       |
| `visible_markers` y `last_correction` en `/metrics` | Vacío y `null`, como se esperaba: el simulador no envía detecciones.        |

No se adjuntó una captura de pantalla en esta corrida; la confirmación visual
fue reportada por el usuario. La versión de Foxglove Studio se obtuvo del
registro de programas instalados de Windows.

Con esto se cumple el criterio de aceptación de la Fase 2. El 2026-11-06 también
se verificó el relay con el servidor HTTPS real: el simulador usó
`wss://localhost:8443/ingest` y la CA de mkcert sin `--insecure`. Queda pendiente
la telemetría del celular y el layout exportado, que corresponde a la Fase 7.

## 5. Verificación de la Fase 3

### 5.1. Alcance implementado

- `packages/client/ar.html` y `packages/client/src/ar.ts`: pantalla de inicio,
  comprobación de HTTPS y `immersive-ar`, sesión con `dom-overlay`,
  `local-floor` con fallback a `local` y `camera-access` como feature opcional.
- Conversión de cada `XRViewerPose` a `odom` con `poseFromWebXRMatrix` y envío de
  mensajes `pose` a `poseHz` (30 Hz por defecto). El mensaje no incluye
  `corrected`; el servidor usa `T_WORLD_ODOM_INITIAL`.
- Overlay con tracking, FPS, estado del relay, mensajes enviados, buffer,
  `camera-access` y posición cruda/corregida para diagnóstico.
- `packages/client/src/ws-client.ts`: reconexión con backoff exponencial y
  jitter, buffer máximo de 120 mensajes, edad máxima de 3 s y descarte de los
  mensajes más viejos.
- `packages/client/src/client-config.ts`: overrides `?hz=1..60` y
  `?ingest=ws://...|wss://...` para pruebas. La comprobación de soporte tiene un
  timeout de 5 s para que la UI no quede en **consultando** si
  `isSessionSupported` no responde.

### 5.2. Prueba de integración del payload

El **2026-11-07** se levantó el servidor con `pnpm start` y se conectó un
WebSocket de Node a `wss://localhost:8443/ingest` usando `certs/rootCA.pem` como
CA. Se envió un mensaje idéntico al del cliente, sin `hello`:

```json
{
  "type": "pose",
  "t": 1794000000000,
  "raw": { "p": [0, 1.4, 0], "q": [0, 0, 0, 1] },
  "tracking": "tracking"
}
```

`/health` registró 1 mensaje recibido, 1 válido, 0 inválidos, 0 `hello` y 1
`pose`. Esto confirma que el relay acepta el mensaje de la Fase 3 y que el
cliente no necesita `hello` para enviar poses. **No** valida WebXR ni el
movimiento real: eso requiere el celular.

También el **2026-11-07** se cargó `/ar.html` en Chrome headless contra el
servidor compilado. La página mostró `HTTPS: sí`, `Relay: conectado` y, tras el
timeout de 5 s, `immersive-ar: no soportado`; no hubo errores JavaScript. Esto
verifica el arranque de la página y el WebSocket, no el soporte real de WebXR
(el flag `--ignore-certificate-errors` se usó solo para el smoke test local).

### 5.3. Cobertura automática de la Fase 3

`ws-client.test.ts` prueba con un WebSocket falso y timers simulados:

- envío directo cuando el socket está abierto;
- buffer y vaciado en orden al abrir;
- descarte del mensaje más viejo al superar el límite;
- descarte por antigüedad al reconectar;
- backoff exponencial con jitter y reinicio del intento al abrir;
- cierre definitivo sin reconexión;
- reconexión cuando el constructor de WebSocket falla.

### 5.4. Criterio de aceptación

El criterio de la Fase 3 —caminar con el celular y ver la pose moverse de forma
fluida en Foxglove, con los ejes correctos— **no se puede verificar sin un
dispositivo ARCore**. Queda pendiente y no se declara cumplido. Las pruebas
automáticas y de relay solo cubren el transporte y el formato del mensaje.

## 6. Verificación de la Fase 4

### 6.1. Alcance implementado

- `packages/shared/src/camera/intrinsics.ts`: derivación de `fx`, `fy`, `cx`,
  `cy`, `skew` desde `XRView.projectionMatrix`; origen configurable
  `bottom-left`/`top-left`; escalado por ejes y a un tamaño destino.
- `packages/shared/src/camera/calibration.ts`: esquema zod de
  `config/camera_intrinsics.json`, validación y escalado a la imagen procesada
  sin reflejar `cy`.
- `packages/client/src/camera-capture.ts`: binding de `XRWebGLBinding`,
  framebuffer propio, shader que invierte `v`, `readPixels` RGBA, conversión a
  gris top-left, cálculo de intrínsecos y buffer reutilizable.
- `packages/client/src/camera-calibration.ts`: descarga y validación de la
  calibración; distingue `ok`, `missing` (404), `invalid` y `error`.
- `packages/client/src/device-label.ts`: extracción del modelo de Android para
  `hello`, con recorte a 256 caracteres.
- `packages/client/src/ar.ts`: integración de la captura a `cameraHz`, vista
  previa, overlay de cámara/intrínsecos/`hello`, degradación a solo VIO cuando
  `camera-access` o `XRWebGLBinding` no están disponibles, y limpieza de la
  sesión.
- `packages/client/src/client-config.ts`: `maxDimension` (640 px), `captureHz`
  (10 Hz), `preview` y `calibrationUrl`, con overrides `?camhz=`, `?camw=` y
  `?preview=`.
- `packages/server/src/camera-calibration-loader.ts` y `index.ts`: carga
  opcional al arrancar, validación zod, endpoint
  `GET /config/camera_intrinsics.json` y campos en `/health`.
- `packages/client/vite.config.ts`: proxy de `/config/camera_intrinsics.json`
  hacia el servidor HTTPS.

### 6.2. Verificación en la PC

El **2026-11-07** se ejecutaron los checks del repositorio:

| Comando             | Resultado                                            |
| ------------------- | ---------------------------------------------------- |
| `pnpm typecheck`    | OK en los tres paquetes.                             |
| `pnpm test`         | 15 archivos, 85 tests pasan.                         |
| `pnpm lint`         | OK.                                                  |
| `pnpm build`        | OK; `/ar.html` y los assets de la Fase 4 se generan. |
| `pnpm format:check` | OK.                                                  |

También se levantó el servidor con `pnpm start` y se consultó el endpoint:

| Prueba                                           | Resultado                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| `GET /config/camera_intrinsics.json` sin archivo | HTTP **404**, `{"error":"camera_intrinsics_not_found"}`. |
| `/health` sin archivo                            | `camera_intrinsics.available: false`, `error: null`.     |
| Endpoint con `camera_intrinsics.example.json`    | HTTP **200** con `image_size` e `intrinsics`.            |
| `/health` con archivo                            | `camera_intrinsics.available: true`, `error: null`.      |
| Procesos al terminar                             | Sin listeners en 8443 ni 8765.                           |

La calibración de ejemplo se copió temporalmente a
`config/camera_intrinsics.json` y se eliminó al terminar; el archivo local sigue
ignorado por git.

### 6.3. Cobertura automática de la Fase 4

- `intrinsics.test.ts`: frustum simétrico, frustum asimétrico con `skew`,
  viewport con offset, reflejo de `cy`, escalado y rechazo de matrices o
  viewports inválidos.
- `calibration.test.ts`: esquema estricto, campos opcionales y escalado a
  `640×360`.
- `camera-capture.test.ts`: reducción preservando aspecto, imágenes verticales,
  dimensiones mínimas y ausencia de `XRWebGLBinding`.
- `camera-calibration.test.ts`: 200 válido, 404, 503, error de red, JSON
  inválido y esquema inválido.
- `device-label.test.ts`: modelo de Android, sufijo `wv`, fallback a Chrome y
  truncado.
- `client-config.test.ts`: defaults y overrides de cámara, incluidos los
  warnings por valores fuera de rango.
- `camera-calibration-loader.test.ts`: archivo ausente, válido, JSON inválido y
  esquema inválido.

### 6.4. Criterio de aceptación

El criterio de la Fase 4 —ver la imagen en gris a ≥10 Hz con orientación
correcta y disponer de intrínsecos utilizables— **no se puede verificar sin un
celular con `camera-access`**. Queda pendiente. Las pruebas de la PC solo
demuestran la matemática, el empaquetado, la configuración y el endpoint; no
demuestran que Chrome Android entregue la textura ni que la orientación sea la
esperada en un dispositivo concreto.

## 7. Herramientas y artefactos

### Marcadores

`pnpm markers` generó:

- 6 PNG de 1890 × 1890 px a 300 DPI;
- un PDF A4 de 6 páginas;
- patrón de 16,0 cm de lado, zona de silencio de 2,0 cm y regla de control de
  10,0 cm.

El PDF y los PNG son artefactos ignorados por git; se regeneran con el comando
anterior. No se validó la impresión física ni el tamaño medido con regla.

### Mapa demo

`pnpm map:demo` generó `config/marker_map.json` para una sala de 4 × 3 × 2,5 m
con 6 marcadores. Los tests comprueban que las poses coinciden con
`markerPoseOnWall`. El mapa es sintético: no se midió una sala real.

### Servidor

El servidor actual:

- sirve el build de `packages/client/dist`;
- expone `GET /health` con el estado de la ingesta y de Foxglove;
- usa HTTPS por defecto en el puerto 8443;
- monta el relay `/ingest` sobre el mismo servidor;
- valida los mensajes con zod y descarta los inválidos;
- publica `/tf`, `/pose/raw`, `/pose/corrected`, `/markers` y `/metrics` en
  `ws://IP_DE_LA_PC:8765`;
- acepta `--http` para pruebas de escritorio;
- incluye `pnpm sim` y el cliente móvil `/ar.html` como fuentes de telemetría.

## 8. Verificaciones manuales pendientes

Las siguientes pruebas no se pueden hacer sin el celular. Quedan registradas
como pendientes, no como aprobadas. La validación de Foxglove Studio ya se
registró en la sección 4.3.

- [x] `pnpm cert:setup` ejecutado y certificados generados con mkcert.
- [x] `/health` responde por HTTPS con `tls: true` y certificado válido.
- [x] El relay acepta `wss://` con la CA de mkcert y mensajes válidos.
- [ ] Reglas de firewall para TCP 5173, 8443 y 8765 creadas en PowerShell
      elevado.
- [ ] Instalación de `rootCA.pem` como CA de usuario en Android.
- [ ] `https://IP_DE_LA_PC:5173/` abre en Chrome Android sin advertencias.
- [ ] La página de inicio detecta contexto seguro y servidor disponible.
- [ ] `/ar-test.html` inicia una sesión `immersive-ar` en el celular.
- [ ] `/ar.html` inicia la sesión y muestra tracking, FPS y estado del relay en
      el overlay.
- [ ] La sesión entrega tracking y FPS estables.
- [ ] La pose cruda del celular llega por `wss://` al relay y aparece en
      `/health`, `/pose/raw` y `/tf` (`odom → camera`).
- [ ] Caminar hacia adelante mueve el marco en la dirección esperada de `world`;
      los giros y el movimiento vertical son coherentes.
- [ ] La pose se ve fluida en Foxglove a una frecuencia cercana a 30 Hz.
- [ ] `camera-access` se habilita y `getCameraImage` devuelve una textura.
- [ ] La vista previa en gris se ve a ≥10 Hz y con orientación correcta.
- [ ] Los intrínsecos del overlay son estables y corresponden a la imagen
      procesada.
- [ ] El servidor recibe `hello` (`byType.hello > 0`) con el dispositivo y
      `image_size` correctos.
- [ ] Con una calibración propia, `/ar.html` muestra **Fuente: calibración** y
      los valores escalados.
- [ ] El modo mock abre la webcam en la PC y la pose simulada responde al
      teclado.
- [ ] Se guardó el reporte JSON de `/ar-test.html` como evidencia.
- [x] El endpoint `/config/camera_intrinsics.json` responde 404 sin archivo y
      200 con una calibración válida (verificado en la PC el 2026-11-07).

### Cómo registrar el resultado

En `/ar-test.html`, presionar **Copiar reporte** y pegar el JSON en una sección
nueva de este documento, indicando:

- modelo de celular;
- versión de Android y de Chrome;
- versión de Google Play Services for AR;
- fecha y hora de la prueba;
- resultado de `enabledFeatures`;
- errores observados.

Para la Fase 3, registrar además el estado del overlay de `/ar.html`, el valor
de `ingest.messagesValid` en `/health` y una captura de Foxglove con
`/pose/raw`, `/tf` y la trayectoria cruda.

Para la Fase 4, registrar además:

- tamaño procesado de la imagen y frecuencia de captura del overlay;
- valores de intrínsecos y fuente (`XRView` o `calibración`);
- captura de la vista previa en gris, indicando si la orientación es correcta;
- `byType.hello`, `ingest.devices` y el `image_size` recibido en `/health`;
- si se usó `config/camera_intrinsics.json`, su `image_size` y el valor de
  `camera_intrinsics.available` en `/health`.

La prueba de Foxglove del 2026-11-05 quedó registrada en la sección 4.3 con la
versión 3.5.0 y la URL de conexión. Para futuras corridas, agregar una captura
del panel 3D con las dos trayectorias.

No modificar los resultados automáticos sin volver a ejecutar los comandos.

## 9. Limitaciones conocidas

1. **Validación móvil bloqueada:** no hay un celular ARCore conectado en el
   entorno de desarrollo actual.
2. **`camera-access`:** es una feature opcional y puede no estar disponible en
   el dispositivo. Si falla, la Fase 4 queda bloqueada; no se puede resolver con
   tests unitarios.
3. **Emulador:** el emulador de Android Studio no implementa WebXR.
4. **Mapa sintético:** las poses de los marcadores no provienen de una sala
   real y no se comprobó la orientación física.
5. **Fase 3:** el cliente y el transporte están implementados y testeados, pero
   la fluidez, el tracking y la orientación de los ejes no se validaron en un
   celular real. El criterio de aceptación sigue pendiente.
6. **Fase 4:** la captura, la conversión a gris, la calibración y el `hello`
   están implementados y testeados, pero la textura real, la orientación de la
   imagen y la estabilidad de los intrínsecos no se validaron en un celular. El
   criterio de aceptación sigue pendiente.
7. **Foxglove Studio:** validado en escritorio con la versión 3.5.0; falta la
   telemetría real del celular y una captura de evidencia.
8. **Relay HTTPS:** validado con `wss://localhost:8443/ingest` y la CA de mkcert.
   Falta repetirlo desde el celular por la IP LAN.
9. **mkcert:** instalado y con certificados generados; la CA todavía no está
   instalada en Android y las reglas de firewall requieren una consola elevada.
10. **`@foxglove/ws-protocol` 0.8.0:** está deprecado; se usa igual por la
    decisión del proyecto y se revisará si aparece un problema de compatibilidad.

## 10. Próximo paso

1. Instalar `certs/rootCA.pem` en el celular y crear las reglas de firewall en
   una consola elevada.
2. Completar el checklist de la Fase 0 cuando haya un celular ARCore.
3. Validar `/ar.html` en el celular: sesión, tracking, pose en Foxglove, ejes y
   fluidez. Con eso se cierra la Fase 3.
4. Validar la Fase 4 en el celular: `camera-access`, `getCameraImage`, vista
   previa en gris a ≥10 Hz, orientación, intrínsecos y `hello`. Con eso se
   cierra la Fase 4.
5. Repetir el relay por la IP LAN durante la integración del celular.
6. Iniciar la Fase 5 (detección AprilTag) recién cuando las fases 3 y 4 estén
   aceptadas.

La Fase 2 está cerrada. Las fases 3 y 4 están implementadas, pero no aceptadas
hasta probarlas en un dispositivo real. El proyecto mantiene la regla de cerrar
una fase antes de iniciar la siguiente.
