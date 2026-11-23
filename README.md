# VIO con marcadores fiduciarios y Foxglove

Sitio web para Chrome Android que combina la pose de WebXR/ARCore con la
detección de AprilTags 36h11 para corregir la deriva de localización. El
servidor Node.js recibe la telemetría del celular por un relay WebSocket seguro
y la publica en Foxglove Studio por WebSocket.

El proyecto es un monorepo pnpm con TypeScript estricto, ESLint y Vitest. La
documentación y la interfaz están en español; el código y los tests en inglés.

## Estado actual

| Fase                                | Estado                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| 0 — entorno, HTTPS y prueba AR      | **Completada** en POCO X7 Pro el 2026-11-22.                              |
| 1 — matemática SE(3) y convenciones | **Completada.**                                                           |
| 2 — relay y servidor Foxglove       | **Completada**, con simulador y telemetría móvil real.                    |
| 3 — cliente WebXR y pose cruda      | **Completada en POCO X7 Pro.**                                            |
| 4 — cámara e intrínsecos            | **Completada para el POCO X7 Pro.**                                       |
| 5 — detección de marcadores y PnP   | Validada con ID 0 en pantalla; falta precisión métrica con tamaño medido. |
| 6 — corrección de localización      | Implementada; falta validación física de los modos de corrección.         |
| 7 — visualización en Foxglove       | **Completada**, validada en Foxglove Studio 3.6.0.                        |
| 8 — registro y evaluación           | Grabador y analizador implementados; falta una corrida real y gráficos.   |
| 9 — experimentos físicos            | Guía preparada; ejecución pendiente.                                      |
| 10 — documentación y entrega        | En curso; faltan resultados físicos, informe y video/demo.                |

La Fase 0 incluye el servidor HTTPS, el script de certificados, las páginas de
diagnóstico WebXR y el modo mock de escritorio. El 2026-11-22 se instaló la CA
de `mkcert` en Android y se verificaron HTTPS por LAN, `immersive-ar`,
`local-floor` y `camera-access` en un POCO X7 Pro.

La Fase 2 incluye el relay `/ingest`, la validación zod de los mensajes, el
servidor Foxglove en `:8765`, la publicación de TF, poses, marcadores y métricas,
y un simulador de cliente. El circuito está cubierto por tests de integración.
Se validó visualmente con Foxglove Studio 3.5.0 el 2026-11-05 y posteriormente
con Foxglove Studio 3.6.0 el 2026-11-22, incluyendo un layout de tres paneles.
El relay por `wss` con el certificado de mkcert también se verificó localmente.
El 2026-11-22 se comprobó la IP LAN con telemetría real: 3502 mensajes válidos,
0 inválidos, 3497 `pose` y 5 `hello`. Ver [`docs/results.md`](docs/results.md).

La Fase 3 agrega `/ar.html`: sesión `immersive-ar`, reference space
`local-floor` con fallback a `local`, overlay con tracking/FPS/conexión y envío
de pose cruda en `odom` a ~30 Hz. El cliente WebSocket reconecta con backoff,
mantiene un buffer acotado y descarta mensajes viejos. La pose corregida la
deriva el servidor con `T_WORLD_ODOM_INITIAL`. En el POCO se observó tracking a
27–30 FPS, buffer 0, movimiento fluido en Foxglove y una deriva estacionaria de
1,7 mm en aproximadamente 30 s. El 2026-11-23 se verificaron avance hacia
`+world.x`, izquierda hacia `+world.y`, altura hacia `+world.z` y giro derecho
sobre `-world.z`, con tracking 100 % y 0 mensajes inválidos.

La Fase 4 agrega la captura de cámara cuando `camera-access` está disponible:
`XRWebGLBinding.getCameraImage` se reduce en GPU a un framebuffer de 640 px de
lado máximo, se convierte a gris con origen arriba a la izquierda y se muestra
en el overlay. Los intrínsecos se derivan de `XRView.projectionMatrix` o se
cargan de la calibración opcional `config/camera_intrinsics.json`; se envían en
un mensaje `hello` al abrir la conexión y después de cada reconexión. El
servidor expone `GET /config/camera_intrinsics.json` (404 si no hay archivo).
En el POCO se validaron una textura de 864×1920, gris procesado de 288×640 a
10,2 Hz, orientación correcta, intrínsecos estables derivados de `XRView` y el
envío de `hello`.

La Fase 5 agrega la detección de marcadores AprilTag 36h11 y la estimación de
pose PnP (`T_cam_marker`) mediante OpenCV.js (`@techstark/opencv-js`) en un Web
Worker (`marker-worker.ts`) sin bloquear el bucle de renderizado WebXR. La imagen
en escala de grises se transfiere al worker mediante `Transferable` (Zero-Copy)
usando un pool de buffers. La detección ejecuta `solvePnP` (con `SOLVEPNP_IPPE_SQUARE`),
calcula el error de reproyección (`≤ 5.0 px`) y transmite los mensajes `marker` por
WebSocket al relay. Incluye overlay de depuración 2D/3D (`debug-overlay.ts`) que
dibuja el contorno del marcador, su ID, error y los ejes 3D proyectados (X=rojo,
Y=verde, Z=azul). En el POCO se registraron 882 observaciones del ID 0 mostrado
en una pantalla, con error de reproyección medio de 0,33 px y máximo de 2,09 px.

La Fase 6 agrega la corrección de localización con mapa conocido de marcadores
(`LocalizationCorrector`). Descarga `config/marker_map.json` expuesto por el
servidor y aplica las observaciones PnP para ajustar la transformación `T_world_odom`.
Admite tres modos de operación: reemplazo directo (Estrategia A), suavizado
gradual por LERP/SLERP (Estrategia B) y modo desactivado (Off), seleccionables
mediante controles en la UI o por parámetro de URL (`?mode=direct|smooth|off`).
Filtra observaciones inestables u outliers (error de reproyección > 5 px, saltos
de posición > 1,5 m o saltos angulares > 45°) y transmite la pose corregida
(`corrected`) a ~30 Hz y mensajes de tipo `correction` a Foxglove Studio.

## Arquitectura

```text
Celular (Chrome Android)
  WebXR pose + imagen de cámara
             |
             v
  Worker de detección (OpenCV.js, Fase 5)
             |
             v
  Corrección con mapa de marcadores (Fase 6)
             |
             v
  WebSocket seguro /ingest (Fase 2)
             |
             v
PC: servidor Node.js
  HTTPS + relay + servidor Foxglove :8765
             |
             v
  Foxglove Studio (panel 3D, plots, mensajes)
```

En las fases actuales existen el navegador, el servidor HTTPS, el relay
`/ingest`, el servidor Foxglove, la matemática de poses, el mapa demo, el
simulador, el cliente `/ar.html`, el Web Worker de detección de marcadores
con OpenCV.js (Fase 5), la corrección de localización (Fase 6) y el grabador
de recorridos JSONL (Fase 8). Las pruebas físicas de la Fase 9 siguen pendientes.

## Estructura

```text
.
├── config/
│   ├── marker_map.json        # mapa de marcadores de la sala demo
│   └── camera_intrinsics.example.json  # calibración opcional (ejemplo)
├── docs/
│   ├── setup.md
│   ├── conventions.md
│   ├── marker-map.md
│   ├── results.md
│   └── phase-9-physical-tests.md
│
├── packages/
│   ├── shared/                # SE(3), convenciones, esquemas y mapa
│   ├── client/                # Vite, WebXR y modo mock
│   └── server/                # HTTPS, relay /ingest, Foxglove y simulador
├── tools/
│   ├── generate_markers.py    # PNG y PDF A4 de AprilTags
│   ├── make_demo_map.py       # genera config/marker_map.json
│   └── setup-certs.ps1        # mkcert, CA y firewall
├── markers/                   # generado; ignorado por git
├── certs/                     # generado; ignorado por git
└── data/runs/                 # logs de corridas; ignorado por git
```

## Requisitos

- Node.js 22.12 o superior (probado con 22.14).
- pnpm 11.
- Git.
- `mkcert` y permisos de administrador para instalar la CA y abrir el firewall.
- Celular Android compatible con ARCore y Chrome actualizado.
- Python 3 con `opencv-contrib-python`, `numpy` y `Pillow` para regenerar
  marcadores y el mapa demo.
- Foxglove Studio de escritorio para las fases 2 y 7.

El emulador de Android Studio no implementa WebXR: la prueba de AR se hace en un
celular real.

## Inicio rápido

```powershell
pnpm install
pnpm approve-builds --all   # solo si pnpm lo pide
pnpm cert:setup             # PowerShell como administrador
pnpm markers                # opcional: regenera PNG/PDF de los marcadores
pnpm dev
```

Luego:

1. Instalá `certs/rootCA.pem` como certificado de CA de usuario en Android.
2. Conectá el celular a la misma WiFi que la PC.
3. Abrí `https://IP_DE_LA_PC:5173/` en Chrome Android.
4. Verificá que el certificado no muestre advertencias.
5. Entrá a **Abrir cliente AR (Fases 3 y 4)** (`/ar.html`) y presioná
   **Iniciar AR**.
6. Para inspeccionar `camera-access` y copiar un reporte, usá **Diagnóstico
   WebXR** (`/ar-test.html`).

La guía completa, incluidas las variantes de Android para instalar la CA, el
firewall, `adb reverse` y la solución de problemas, está en
[`docs/setup.md`](docs/setup.md).

### Build servido por Node

```powershell
pnpm build
pnpm start
```

Abre `https://IP_DE_LA_PC:8443/`. `pnpm preview` combina ambos pasos.

### Relay y Foxglove

Con `pnpm dev` o `pnpm start`, el servidor monta:

- el relay seguro `wss://IP_DE_LA_PC:8443/ingest`;
- el servidor Foxglove `ws://IP_DE_LA_PC:8765`.

Para probar el circuito sin celular, dejá el servidor corriendo y en otra
terminal ejecutá:

```powershell
pnpm sim -- --trajectory circle --drift
```

El simulador envía `hello` y poses a 30 Hz. `--drift` separa la trayectoria
cruda de la corregida para ver ambas en Foxglove. También acepta
`--trajectory square`, `--rate 15`, `--duration 10`, `--url ws://...` y
`--insecure`.

En Foxglove Studio de escritorio:

1. **Open connection** → **Foxglove WebSocket**.
2. URL `ws://IP_DE_LA_PC:8765`.
3. Habilitar los tópicos `/tf`, `/pose/raw`, `/pose/corrected`, `/markers` y
   `/metrics`.

| Tópico            | Esquema                    | Contenido                                        |
| ----------------- | -------------------------- | ------------------------------------------------ |
| `/tf`             | `foxglove.FrameTransforms` | `world→odom`, `odom→camera`, `world→marker_<id>` |
| `/pose/raw`       | `foxglove.PoseInFrame`     | pose cruda en `odom`                             |
| `/pose/corrected` | `foxglove.PoseInFrame`     | pose corregida en `world`                        |
| `/markers`        | `foxglove.SceneUpdate`     | cubos, etiquetas y trayectorias                  |
| `/metrics`        | `vio.Metrics`              | estado, FPS, latencia y corrección               |

El layout de tres paneles de Foxglove Studio se encuentra versionado en
`foxglove/layout.json`. Su visualización se validó en escritorio con
Foxglove Studio 3.6.0 el 2026-11-22.

### Modo mock

`pnpm dev` también sirve `https://IP_DE_LA_PC:5173/mock.html`: webcam real y pose
simulada en la convención de WebXR. No valida ARCore ni `camera-access`.

## Páginas

| Ruta            | Descripción                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | Estado del entorno, enlaces y verificación del servidor.                                                                                                |
| `/ar.html`      | Cliente de las fases 3, 4, 5 y 6: pose cruda, pose corregida, cámara en gris, intrínsecos, detección AprilTag, corrección de localización y overlay 3D. |
| `/ar-test.html` | Prueba de `immersive-ar`, reference spaces y `camera-access`.                                                                                           |
| `/mock.html`    | Webcam y simulación de pose para escritorio.                                                                                                            |
| `/health`       | Estado del servidor, la ingesta, la calibración y Foxglove en JSON.                                                                                     |

## Comandos

| Comando                             | Qué hace                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                          | Vite en `:5173` y servidor Node en `:8443`.                   |
| `pnpm dev:client`                   | Solo Vite.                                                    |
| `pnpm dev:server`                   | Solo servidor Node con recarga.                               |
| `pnpm build`                        | Compila el cliente multipágina en `packages/client/dist`.     |
| `pnpm start`                        | Sirve el build con HTTPS en `:8443`.                          |
| `pnpm sim`                          | Simulador de cliente contra `/ingest`.                        |
| `pnpm analyze -- <corrida.jsonl>`   | Calcula métricas y exporta JSON/CSV para el informe.          |
| `pnpm preview`                      | `pnpm build` seguido de `pnpm start`.                         |
| `pnpm typecheck`                    | TypeScript estricto en todos los paquetes.                    |
| `pnpm test`                         | Vitest. Estado actual: 21 archivos, 122 tests.                |
| `pnpm lint`                         | ESLint.                                                       |
| `pnpm format` / `pnpm format:check` | Prettier sobre el repo.                                       |
| `pnpm cert:setup`                   | Genera certificados mkcert, exporta la CA y abre el firewall. |
| `pnpm markers`                      | Genera los AprilTags y el PDF A4. Requiere Python.            |
| `pnpm map:demo`                     | Regenera el mapa de la sala demo.                             |

### Desarrollo sin TLS

El servidor acepta `--http` para pruebas locales de escritorio:

```powershell
pnpm build
pnpm --filter @vio/server start -- --http
```

No usar HTTP para la prueba en el celular: WebXR exige un contexto seguro y
Chrome no permite `getUserMedia` ni `camera-access` desde una IP en HTTP.

## Convenciones

La fuente de verdad completa es [`docs/conventions.md`](docs/conventions.md).
Resumen:

- `world`: ROS/Foxglove, x adelante, y izquierda, z arriba.
- `odom`: WebXR, x derecha, y arriba, z atrás; la cámara mira a `-z`.
- `cv_camera`: OpenCV, x derecha, y abajo, z adelante.
- `marker_<id>`: x derecha, y arriba, z saliendo de la cara visible.
- Poses `{ p: [x, y, z], q: [x, y, z, w] }`, metros, radianes y cuaterniones
  unitarios.
- Corrección:
  `T_world_odom = T_world_marker * inverse(T_odom_cam * C_WEBXR_CV * T_cam_marker)`.
- `world` es z-arriba desde el inicio mediante `T_WORLD_ODOM_INITIAL`; el primer
  marcador de la Fase 6 reemplaza esa estimación.

El orden de ejes y la conversión WebXR/OpenCV están cubiertos por tests en
`packages/shared`. Los cambios de convención deben actualizar
`docs/conventions.md` y los tests en el mismo cambio.

## Mapa de marcadores

`config/marker_map.json` describe una sala demo de 4 × 3 × 2,5 m con seis
AprilTags de 16 cm. Las imágenes y el PDF se generan con `pnpm markers`; el
procedimiento de impresión al 100 %, la orientación física y cómo medir una
sala real están en [`docs/marker-map.md`](docs/marker-map.md).

Los PNG, el PDF, los certificados, la calibración local y los logs de corridas
no se versionan.

## Calibración de cámara

La calibración es opcional. Sin `config/camera_intrinsics.json`, `/ar.html`
deriva `fx`, `fy`, `cx` y `cy` de `XRView.projectionMatrix` y del tamaño de la
imagen de cámara. Para usar una calibración propia:

```powershell
Copy-Item config/camera_intrinsics.example.json config/camera_intrinsics.json
# editar image_size e intrinsics con los valores medidos
pnpm dev
```

El servidor sirve el archivo en `/config/camera_intrinsics.json` y lo valida con
zod. Si el archivo no existe responde 404; si es inválido, 503. Los valores se
escalan a la resolución procesada (640 px de lado máximo por defecto). Ver
[`docs/conventions.md`](docs/conventions.md#61-intrínsecos-de-cámara-fase-4).

## Testing y validación

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm format:check
```

El estado de los tests automáticos y las verificaciones manuales se documenta
en [`docs/results.md`](docs/results.md). En el estado actual hay 21 archivos y
122 tests: 44 de `packages/shared`, 43 de `packages/client` y 35 de
`packages/server`. Las pruebas WebXR siguen requiriendo un celular real; el
emulador no las reemplaza. El plan restante está resumido en
[`docs/validation-plan.md`](docs/validation-plan.md).

## Roadmap

1. **Fases 0, 1, 2, 3, 4 y 7:** completadas para el entorno y dispositivo probados.
2. **Fase 5:** detección y PnP validados con un marcador ID 0 en pantalla;
   falta medir el tamaño visible y comprobar precisión métrica a distancia conocida.
3. **Fase 6:** implementada en código. Corrección de localización (`LocalizationCorrector`)
   con mapa de marcadores, estrategias directa y suavizada, filtrado de outliers,
   selector de modo en UI y transmisión de pose corregida a Foxglove. Falta la
   validación física.
4. **Fase 8:** grabar y analizar una corrida real con `pnpm analyze`.
5. **Fase 9:** ejecutar la guía de experimentos físicos con al menos tres
   repeticiones por condición.
6. **Fase 10:** incorporar tablas/gráficos y preparar el informe y video final.

## Limitaciones conocidas

- La validación móvil se realizó en un solo modelo, POCO X7 Pro; otros Android
  compatibles con ARCore pueden comportarse de forma diferente.
- La precisión métrica de PnP todavía requiere un marcador de tamaño físico
  medido y una distancia de referencia; la prueba en pantalla solo valida
  detección, estabilidad y error de reproyección.
- `camera-access` es opcional. Si el dispositivo no lo habilita, `/ar.html`
  sigue funcionando solo con VIO y las Fases 4 y 5 quedan bloqueadas.
- Foxglove Studio y el layout se validaron en escritorio; además recibió
  telemetría real del celular. Conviene guardar una captura final para el informe.
- El mapa actual es sintético; no se midió una sala real.
- `@foxglove/ws-protocol` está deprecado, aunque se mantiene la versión elegida
  por el plan.
- El servidor Foxglove usa `ws://` en la red local; el relay del celular sí usa
  `wss://`.
- El modo HTTP solo sirve para escritorio.
- La red WiFi debe permitir tráfico entre PC y celular; si no, usar hotspot o
  `adb reverse`.
