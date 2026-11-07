# VIO con marcadores fiduciarios y Foxglove

Sitio web para Chrome Android que combina la pose de WebXR/ARCore con la
detección de AprilTags 36h11 para corregir la deriva de localización. El
servidor Node.js recibe la telemetría del celular por un relay WebSocket seguro
y la publica en Foxglove Studio por WebSocket.

El proyecto es un monorepo pnpm con TypeScript estricto, ESLint y Vitest. La
documentación y la interfaz están en español; el código y los tests en inglés.

## Estado actual

| Fase                                | Estado                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| 0 — entorno, HTTPS y prueba AR      | Implementada en código. **Validación en celular pendiente.** |
| 1 — matemática SE(3) y convenciones | Completada.                                                  |
| 2 — relay y servidor Foxglove       | Completada. Validada en Foxglove Studio 3.5.0.               |
| 3 — cliente WebXR y pose cruda      | Implementada en código. **Validación en celular pendiente.** |
| 4 — cámara e intrínsecos            | Implementada en código. **Validación en celular pendiente.** |
| 5 a 10                              | Pendientes.                                                  |

La Fase 0 incluye el servidor HTTPS, el script de certificados, las páginas de
diagnóstico WebXR y el modo mock de escritorio. Los certificados de mkcert se
generaron el 2026-11-06 y el HTTPS local está verificado; falta instalar la CA
en Android y validar `immersive-ar` y `camera-access` en un celular real.

La Fase 2 incluye el relay `/ingest`, la validación zod de los mensajes, el
servidor Foxglove en `:8765`, la publicación de TF, poses, marcadores y métricas,
y un simulador de cliente. El circuito está cubierto por tests de integración y
se validó visualmente en Foxglove Studio 3.5.0 el 2026-11-05: se vieron los cinco
tópicos, los seis marcadores y las dos trayectorias. El relay por `wss` con el
certificado de mkcert también se verificó localmente. Falta la telemetría real
del celular y repetir el relay por la IP LAN. Ver `docs/results.md`.

La Fase 3 agrega `/ar.html`: sesión `immersive-ar`, reference space
`local-floor` con fallback a `local`, overlay con tracking/FPS/conexión y envío
de pose cruda en `odom` a ~30 Hz. El cliente WebSocket reconecta con backoff,
mantiene un buffer acotado y descarta mensajes viejos. La pose corregida la
deriva el servidor con `T_WORLD_ODOM_INITIAL`. Los 7 tests originales del
transporte pasan; la validación en celular sigue pendiente.

La Fase 4 agrega la captura de cámara cuando `camera-access` está disponible:
`XRWebGLBinding.getCameraImage` se reduce en GPU a un framebuffer de 640 px de
lado máximo, se convierte a gris con origen arriba a la izquierda y se muestra
en el overlay. Los intrínsecos se derivan de `XRView.projectionMatrix` o se
cargan de la calibración opcional `config/camera_intrinsics.json`; se envían en
un mensaje `hello` al abrir la conexión y después de cada reconexión. El
servidor expone `GET /config/camera_intrinsics.json` (404 si no hay archivo).
La captura real y la orientación de la imagen todavía no se validaron en un
celular.

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
simulador y el cliente `/ar.html`, que envía la pose cruda de WebXR y, si
`camera-access` está disponible, la imagen en gris con sus intrínsecos. La
detección y la corrección llegan en las fases 5 y 6; hasta entonces, la pose
corregida se deriva con `T_WORLD_ODOM_INITIAL`.

## Estructura

```text
.
├── config/
│   ├── marker_map.json        # mapa de marcadores de la sala demo
│   └── camera_intrinsics.example.json  # calibración opcional (ejemplo)
├── docs/
│   ├── setup.md               # instalación, HTTPS y checklist manual
│   ├── conventions.md         # fuente de verdad de ejes y fórmulas
│   ├── marker-map.md          # impresión y medición de marcadores
│   └── results.md             # estado y resultados de validación
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

Todavía no hay layout exportado; el layout de la Fase 7 se versiona en
`foxglove/`.

### Modo mock

`pnpm dev` también sirve `https://IP_DE_LA_PC:5173/mock.html`: webcam real y pose
simulada en la convención de WebXR. No valida ARCore ni `camera-access`.

## Páginas

| Ruta            | Descripción                                                           |
| --------------- | --------------------------------------------------------------------- |
| `/`             | Estado del entorno, enlaces y verificación del servidor.              |
| `/ar.html`      | Cliente de las fases 3 y 4: pose cruda, cámara en gris e intrínsecos. |
| `/ar-test.html` | Prueba de `immersive-ar`, reference spaces y `camera-access`.         |
| `/mock.html`    | Webcam y simulación de pose para escritorio.                          |
| `/health`       | Estado del servidor, la ingesta, la calibración y Foxglove en JSON.   |

## Comandos

| Comando                             | Qué hace                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                          | Vite en `:5173` y servidor Node en `:8443`.                   |
| `pnpm dev:client`                   | Solo Vite.                                                    |
| `pnpm dev:server`                   | Solo servidor Node con recarga.                               |
| `pnpm build`                        | Compila el cliente multipágina en `packages/client/dist`.     |
| `pnpm start`                        | Sirve el build con HTTPS en `:8443`.                          |
| `pnpm sim`                          | Simulador de cliente contra `/ingest`.                        |
| `pnpm preview`                      | `pnpm build` seguido de `pnpm start`.                         |
| `pnpm typecheck`                    | TypeScript estricto en todos los paquetes.                    |
| `pnpm test`                         | Vitest. En el estado actual: 15 archivos, 85 tests.           |
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

El estado de los tests automáticos y las verificaciones manuales pendientes se
documenta en [`docs/results.md`](docs/results.md). En el estado actual hay 15
archivos y 85 tests: 44 de `packages/shared`, 25 de `packages/client` y 16 de
`packages/server`. La prueba en celular no se puede reemplazar con tests
unitarios ni con el emulador. La conexión a Foxglove Studio se validó en
escritorio; la telemetría real del celular sigue pendiente.

## Roadmap

1. **Fase 0:** cerrar la validación en el celular (certificado, `immersive-ar`,
   tracking y `camera-access`).
2. **Fase 2:** completada. Relay, Foxglove y simulador validados en escritorio.
3. **Fase 3:** implementada en código. Falta validar la pose en vivo y los ejes
   en un celular ARCore.
4. **Fase 4:** implementada en código. Falta validar `camera-access`, la
   orientación de la imagen, la vista previa y el `hello` en un celular.
5. **Fases 5–6:** detección AprilTag, PnP y corrección de localización.
6. **Fases 7–10:** layout de Foxglove, métricas, experimentos en sala,
   documentación e informe final.

## Limitaciones conocidas

- La validación real de WebXR y `camera-access` está bloqueada hasta conectar
  un celular ARCore.
- La pose cruda de `/ar.html` no se probó todavía en un dispositivo real; el
  criterio de aceptación de la Fase 3 sigue pendiente.
- La captura de cámara y los intrínsecos de la Fase 4 están implementados, pero
  no se validaron en un celular: faltan la orientación de la imagen, la vista
  previa a ≥10 Hz y la recepción del `hello` con intrínsecos.
- `camera-access` es opcional. Si el dispositivo no lo habilita, `/ar.html`
  sigue funcionando solo con VIO y la Fase 4 queda bloqueada.
- Foxglove Studio se validó en escritorio con la versión 3.5.0; falta la
  telemetría real del celular y una captura de evidencia.
- El mapa actual es sintético; no se midió una sala real.
- `@foxglove/ws-protocol` está deprecado, aunque se mantiene la versión elegida
  por el plan.
- El servidor Foxglove usa `ws://` en la red local; el relay del celular sí usa
  `wss://`.
- El modo HTTP solo sirve para escritorio.
- La red WiFi debe permitir tráfico entre PC y celular; si no, usar hotspot o
  `adb reverse`.
