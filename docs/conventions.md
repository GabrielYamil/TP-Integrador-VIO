# Convenciones de marcos, ejes y mensajes

Este documento es la fuente de verdad para la matemática del proyecto. Cualquier
cambio de convención debe reflejarse acá y en los tests de `packages/shared`.

## 1. Marcos de referencia

| Marco         | Convención                                                                       | Origen y unidades                                  |
| ------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| `world`       | ROS/Foxglove: **x adelante, y izquierda, z arriba** (FLU)                        | Esquina del piso de la sala. Metros.               |
| `odom`        | WebXR/ARCore: **x derecha, y arriba, z hacia atrás**. La cámara mira hacia `-z`. | Origen de la sesión WebXR (`local-floor`). Metros. |
| `camera`      | Marco de la cámara WebXR. Misma orientación que `odom`.                          | Centro óptico de la cámara.                        |
| `cv_camera`   | OpenCV: **x derecha, y abajo, z adelante**. La cámara mira hacia `+z`.           | Salida de PnP (`T_cam_marker`).                    |
| `marker_<id>` | **x derecha, y arriba, z saliendo de la cara visible** (regla derecha).          | Centro de la cara visible del marcador.            |

La cámara de visión usa la convención óptica de OpenCV. La cámara de WebXR usa
la convención de gráficos. Es la única diferencia que hay que convertir con
`C_WEBXR_CV`; no se debe aplicar dos veces.

### Marco del marcador

```
        +y (arriba)
         ^
         |
  -x ----+---- +x (derecha)
         |
         v
        -y

  +z sale de la cara visible, hacia la cámara que observa.
```

Con esta definición, un marcador en una pared que mira al interior de la sala
tiene su `+z` apuntando hacia adentro. El orden de esquinas que usa OpenCV
(arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda) corresponde a
`markerObjectPoints(size_m)` en `packages/shared/src/markers/map.ts`.

## 2. Notación y composición

`T_a_b` es la pose del marco `b` expresada en el marco `a`. La rotación
`R_a_b` lleva coordenadas de `b` a `a`:

```
p_a = R_a_b * p_b + t_a_b
```

La composición se escribe de izquierda a derecha:

```
T_a_c = T_a_b * T_b_c
```

En TypeScript:

```ts
import { compose, inverse, apply } from '@vio/shared';

const T_world_cam = compose(T_world_odom, T_odom_cam);
const p_world = apply(T_world_cam, p_cam);
```

Las poses son `{ p: [x, y, z], q: [x, y, z, w] }`. Los cuaterniones son
unitarios y `q` y `-q` representan la misma rotación.

## 3. Conversiones de ejes

Todas las constantes son poses con traslación cero y se pueden componer
directamente. Están en `packages/shared/src/conventions/axes.ts`.

### `C_WEBXR_CV`

Lleva coordenadas de la cámara OpenCV a la cámara WebXR:

```
C_WEBXR_CV = diag(1, -1, -1)
```

Es una rotación de 180° sobre `x` y es su propia inversa:

```
cv x -> webxr  x
cv y -> webxr -y
cv z -> webxr -z
```

### `C_ROS_WEBXR`

Lleva coordenadas WebXR a ROS/world:

```
          [ 0  0 -1 ]
C_ROS_WEBXR = [ -1  0  0 ]     q = [0.5, -0.5, -0.5, 0.5]
          [ 0  1  0 ]
```

Mapeo de ejes:

```
webxr  x (derecha)   -> ros -y (derecha en ROS)
webxr  y (arriba)    -> ros  z (arriba)
webxr  z (atrás)     -> ros -x (atrás)
webxr -z (adelante)  -> ros  x (adelante)
```

Es una rotación de 120° sobre el eje `(1, -1, -1) / sqrt(3)`. Su inversa es
`C_WEBXR_ROS` con `q = [-0.5, 0.5, 0.5, 0.5]`.

### `C_ROS_CV`

Composición útil para visualizar una cámara OpenCV directamente en ROS:

```
C_ROS_CV = C_ROS_WEBXR * C_WEBXR_CV

cv x -> ros -y
cv y -> ros -z
cv z -> ros  x
```

`C_CV_ROS` es su inversa. También existen `C_CV_WEBXR` y `C_WEBXR_ROS`.

## 4. Transformación inicial `world <- odom`

Antes de ver el primer marcador no hay información del mapa. Para mantener
siempre `world` con z-arriba, se define:

```
T_WORLD_ODOM_INITIAL = { p: [0, 0, 0], q: C_ROS_WEBXR.q }
```

Consecuencias al iniciar la sesión:

- El origen de `world` coincide con el origen de `local-floor` de WebXR.
- El eje `+x` de `world` apunta hacia donde miraba la cámara al iniciar.
- El eje `+z` de `world` es la vertical.
- Si la cámara está a 1,4 m del piso, su pose inicial en `world` es
  aproximadamente `[0, 0, 1.4]` con la orientación inicial.

La Fase 6 reemplaza esta estimación por la que impone el primer marcador
observado. Hasta entonces, la pose "corregida" es la pose inicial rotada a ROS,
no una corrección de mapa.

Código: `packages/shared/src/conventions/initial.ts`.

## 5. Fórmulas de corrección

`T_cam_marker` es la salida de PnP en el marco OpenCV de la cámara. La pose del
marcador en `odom` se reconstruye con:

```
T_odom_marker = T_odom_cam * C_WEBXR_CV * T_cam_marker
```

Con la pose conocida del marcador en el mapa:

```
T_world_odom = T_world_marker * inverse(T_odom_marker)
T_world_cam  = T_world_odom * T_odom_cam
```

Implementación: `packages/shared/src/markers/correction.ts`.

### Test sintético

`packages/shared/src/math/se3.test.ts` construye una observación a partir de una
geometría conocida, agrega una deriva a `T_odom_cam` y verifica que:

- `estimateCorrection(...)` recupera `T_world_odom` con error menor a `1e-6`.
- `correctedCameraPose(...)` devuelve la pose verdadera de la cámara en `world`
  aun con la deriva.

El segundo caso refleja la propiedad importante de la corrección: la pose de la
cámara corregida depende de la observación del marcador y no de la deriva previa
de `odom`.

## 6. Conversión con WebXR

`XRView.transform.matrix` y `XRViewerPose.transform.matrix` son matrices 4x4
column-major (`m[col * 4 + row]`), con la traslación en `m[12..14]`. Es el mismo
formato que WebGL.

```ts
import { poseFromWebXRMatrix, poseToWebXRMatrix } from '@vio/shared';

const pose = poseFromWebXRMatrix(viewerPose.transform.matrix);
const matrix32 = poseToWebXRMatrix(pose);
```

- `poseFromWebXRMatrix` valida que la matriz sea finita y rígida (ortonormal
  derecha, última fila `[0, 0, 0, 1]`), con tolerancia `1e-4` para absorber
  errores de Float32.
- `poseToWebXRMatrix` devuelve `Float32Array`, como espera WebXR.
- La conversión no cambia de convención: solo empaqueta la pose de WebXR.

## 7. Unidades y tiempo

- Longitudes: metros.
- Ángulos: radianes.
- Cuaterniones: `[x, y, z, w]`.
- Tiempo: milisegundos. El celular usa `performance.now()` o el `time` del frame
  XR; el servidor agrega su timestamp de recepción en `receivedAtMs`.
- En la Fase 3, `/ar.html` envía `t = performance.timeOrigin + XRFrame.time`,
  es decir, milisegundos de época del reloj del celular. El `XRFrame.time` usa
  la misma base que `performance.now()`.
- Foxglove usa nanosegundos: la conversión se hace una sola vez en
  `packages/server/src/time.ts`.

## 8. Mensajes cliente -> servidor

Validados con zod en `packages/shared/src/messages/schemas.ts`. El servidor debe
descartar mensajes inválidos y registrarel motivo.

### `pose`

```json
{
  "type": "pose",
  "t": 1234.5,
  "raw": { "p": [0, 1.4, 0], "q": [0, 0, 0, 1] },
  "corrected": { "p": [0, 0, 1.4], "q": [0.5, -0.5, -0.5, 0.5] },
  "tracking": "tracking"
}
```

`tracking` es `tracking`, `limited` o `lost`. `corrected` es opcional hasta que
haya una corrección de mapa. El cliente de la Fase 3 envía solo `raw`, en el
marco `odom`, y omite `corrected`; el servidor deriva la pose corregida con
`T_WORLD_ODOM_INITIAL` y la publica en `/pose/corrected`.

### `marker`

```json
{
  "type": "marker",
  "t": 1234.5,
  "id": 3,
  "T_cam_marker": { "p": [0.1, 0.2, 0.9], "q": [0, 0, 0, 1] },
  "reproj_err_px": 0.8
}
```

`T_cam_marker` está en el marco OpenCV de la cámara.

### `correction`

```json
{
  "type": "correction",
  "t": 1234.5,
  "id": 3,
  "delta_p_m": 0.04,
  "delta_angle_rad": 0.01
}
```

### `hello`

```json
{
  "type": "hello",
  "device": "Pixel 8",
  "intrinsics": { "fx": 500, "fy": 501, "cx": 320, "cy": 240 },
  "image_size": [640, 480]
}
```

`parseClientMessage` devuelve `{ ok: true, message }` o
`{ ok: false, error }`. `parseClientMessageJson` hace lo mismo a partir del
texto recibido por WebSocket.

## 9. Relay y publicación en Foxglove

### 9.1. Ingesta `/ingest`

El cliente se conecta por WebSocket seguro al mismo servidor HTTPS:

```text
wss://IP_DE_LA_PC:8443/ingest
```

Cada mensaje de texto se valida con `parseClientMessageJson`. Los mensajes
inválidos, binarios o recibidos en otra ruta se descartan y se registran. El
mensaje `hello` identifica el dispositivo y queda asociado a la conexión. El
servidor agrega `receivedAtMs` a cada mensaje válido antes de publicarlo.

### 9.2. Canales Foxglove

Todos los canales usan `encoding: "json"` y `schemaEncoding: "jsonschema"`.

| Tópico            | Esquema                    | Contenido                                        |
| ----------------- | -------------------------- | ------------------------------------------------ |
| `/tf`             | `foxglove.FrameTransforms` | `world→odom`, `odom→camera`, `world→marker_<id>` |
| `/pose/raw`       | `foxglove.PoseInFrame`     | pose cruda en `odom`                             |
| `/pose/corrected` | `foxglove.PoseInFrame`     | pose corregida en `world`                        |
| `/markers`        | `foxglove.SceneUpdate`     | cubos, etiquetas y trayectorias                  |
| `/metrics`        | `vio.Metrics`              | estado, FPS, latencia y corrección               |

Foxglove Studio se conecta al servidor WebSocket en `ws://IP_DE_LA_PC:8765`.
Ese canal no usa TLS porque queda en la red local; la telemetría del celular sí
viaja por `wss` al puerto 8443.

`T_world_odom` se obtiene de la pose corregida cuando el mensaje `pose` la
incluye:

```text
T_world_odom = T_world_cam_corrected * inverse(T_odom_cam_raw)
```

Si no hay `corrected`, se usa `T_WORLD_ODOM_INITIAL`; por eso la pose
"corregida" publicada todavía puede ser solo la rotación inicial a ROS hasta la
Fase 6.

La escena `/markers` incluye un cubo y una etiqueta por marcador del mapa, más
`trajectory_raw` en `odom` (rojo) y `trajectory_corrected` en `world` (verde).
Los TF de los marcadores son estáticos y se repiten periódicamente para los
clientes que se conectan tarde.

### 9.3. Tiempo y métricas

Foxglove espera timestamps en nanosegundos. El servidor usa el instante de
recepción (`receivedAtMs`, ms de época) y lo convierte a `bigint` para
`sendMessage` y a `Time { sec, nsec }` para los esquemas `foxglove.*`. El
timestamp del celular se conserva como `client_t_ms` en `/metrics`.

`processing_latency_ms` mide solo el procesamiento del servidor. La latencia
extremo a extremo no se puede calcular sin sincronizar los relojes del celular y
la PC, y no se infiere de `client_t_ms - server_t_ms`.

El layout de vista de Foxglove corresponde a la Fase 7 y todavía no está
versionado.

## 10. Mapa de marcadores

`config/marker_map.json` usa el formato del plan:

```json
{
  "frame_id": "world",
  "dictionary": "APRILTAG_36h11",
  "markers": [
    {
      "id": 0,
      "size_m": 0.16,
      "position": [3.0, 0.0, 1.2],
      "orientation_xyzw": [0.0, 0.707107, 0.707107, 0.0]
    }
  ]
}
```

- `frame_id` debe ser `world`.
- `dictionary` debe ser `APRILTAG_36h11`.
- `size_m` es el lado del cuadrado negro impreso, no el tamaño del papel.
- `position` es el centro de la cara visible en `world`.
- `orientation_xyzw` es la orientación del marco del marcador en `world`.
- El esquema rechaza IDs duplicados y campos extra.

## 11. Errores típicos

1. **Aplicar `C_ROS_WEBXR` dos veces.** La pose cruda de WebXR ya está en
   `odom`; solo se rota una vez para visualizarla en `world`.
2. **Confundir `C_WEBXR_CV` con su inversa.** En este proyecto son iguales, pero
   el orden en la fórmula importa: va entre `T_odom_cam` y `T_cam_marker`.
3. **Usar el tamaño del papel en PnP.** `size_m` es el lado del cuadrado negro.
   El margen blanco no cuenta.
4. **Invertir el orden de las esquinas.** OpenCV devuelve TL, TR, BR, BL; los
   puntos objeto deben respetar ese orden.
5. **Cambiar el signo de la restricción de profundidad.** El marco del marcador
   tiene `+z` hacia la cámara. Un marcador plano visto desde atrás no es válido.
6. **Comparar cuaterniones componente a componente.** `q` y `-q` son la misma
   rotación; usar la matriz o `|dot(q1, q2)|`.
7. **Asumir que el emulador de Android Studio implementa WebXR.** No lo hace;
   `immersive-ar` y `camera-access` se validan en el celular real.
