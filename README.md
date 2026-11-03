# VIO con marcadores fiduciarios y Foxglove

Sitio web para Chrome Android que combina la pose de WebXR/ARCore con la
detección de AprilTags 36h11 para corregir la deriva de localización. El
servidor Node.js recibe la telemetría del celular y, en la Fase 2, la publica
en Foxglove Studio por WebSocket.

El proyecto es un monorepo pnpm con TypeScript estricto, ESLint y Vitest. La
documentación y la interfaz están en español; el código y los tests en inglés.

## Estado actual

| Fase                                | Estado                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| 0 — entorno, HTTPS y prueba AR      | Implementada en código. **Validación en celular pendiente.** |
| 1 — matemática SE(3) y convenciones | Completada. 33 tests pasan.                                  |
| 2 — relay y servidor Foxglove       | No iniciada.                                                 |
| 3 a 10                              | Pendientes.                                                  |

La Fase 0 incluye el servidor HTTPS, el script de certificados, las páginas de
diagnóstico WebXR y el modo mock de escritorio. Todavía no se validó
`immersive-ar` ni `camera-access` en un celular real, y Foxglove todavía no está
integrado. Ver `docs/results.md` para el detalle.

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

En las fases actuales existen las piezas de base: navegador, servidor HTTPS,
matemática de poses, mapa demo y páginas de prueba. El relay, la detección y
Foxglove se agregan en las fases siguientes.

## Estructura

```text
.
├── config/
│   └── marker_map.json        # mapa de marcadores de la sala demo
├── docs/
│   ├── setup.md               # instalación, HTTPS y checklist manual
│   ├── conventions.md         # fuente de verdad de ejes y fórmulas
│   ├── marker-map.md          # impresión y medición de marcadores
│   └── results.md             # estado y resultados de validación
├── packages/
│   ├── shared/                # SE(3), convenciones, esquemas y mapa
│   ├── client/                # Vite, WebXR y modo mock
│   └── server/                # Express, HTTPS y estáticos
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
5. Entrá a **Probar AR en el celular** y ejecutá la prueba de sesión.

La guía completa, incluidas las variantes de Android para instalar la CA, el
firewall, `adb reverse` y la solución de problemas, está en
[`docs/setup.md`](docs/setup.md).

### Build servido por Node

```powershell
pnpm build
pnpm start
```

Abre `https://IP_DE_LA_PC:8443/`. `pnpm preview` combina ambos pasos.

### Modo mock

`pnpm dev` también sirve `https://IP_DE_LA_PC:5173/mock.html`: webcam real y pose
simulada en la convención de WebXR. No valida ARCore ni `camera-access`.

## Páginas

| Ruta            | Descripción                                                   |
| --------------- | ------------------------------------------------------------- |
| `/`             | Estado del entorno, enlaces y verificación del servidor.      |
| `/ar-test.html` | Prueba de `immersive-ar`, reference spaces y `camera-access`. |
| `/mock.html`    | Webcam y simulación de pose para escritorio.                  |
| `/health`       | Estado del servidor en JSON, incluido el flag TLS.            |

## Comandos

| Comando                             | Qué hace                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                          | Vite en `:5173` y servidor Node en `:8443`.                   |
| `pnpm dev:client`                   | Solo Vite.                                                    |
| `pnpm dev:server`                   | Solo servidor Node con recarga.                               |
| `pnpm build`                        | Compila el cliente multipágina en `packages/client/dist`.     |
| `pnpm start`                        | Sirve el build con HTTPS en `:8443`.                          |
| `pnpm preview`                      | `pnpm build` seguido de `pnpm start`.                         |
| `pnpm typecheck`                    | TypeScript estricto en todos los paquetes.                    |
| `pnpm test`                         | Vitest. En el estado actual: 4 archivos, 33 tests.            |
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

Los PNG, el PDF, los certificados y los logs de corridas no se versionan.

## Testing y validación

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm format:check
```

El estado de los tests automáticos y las verificaciones manuales pendientes se
documenta en [`docs/results.md`](docs/results.md). La prueba en celular no se
puede reemplazar con tests unitarios ni con el emulador.

## Roadmap

1. **Fase 0:** cerrar la validación en el celular (certificado, `immersive-ar`,
   tracking y `camera-access`).
2. **Fase 2:** relay `/ingest` con validación zod, servidor Foxglove en `:8765`,
   TF de marcadores y simulador de cliente.
3. **Fases 3–4:** pose cruda en vivo e imagen de cámara con intrínsecos.
4. **Fases 5–6:** detección AprilTag, PnP y corrección de localización.
5. **Fases 7–10:** layout de Foxglove, métricas, experimentos en sala,
   documentación e informe final.

## Limitaciones conocidas

- La validación real de WebXR y `camera-access` está bloqueada hasta conectar
  un celular ARCore.
- El mapa actual es sintético; no se midió una sala real.
- `@foxglove/ws-protocol` está deprecado, aunque se mantiene la versión elegida
  por el plan.
- El modo HTTP solo sirve para escritorio.
- La red WiFi debe permitir tráfico entre PC y celular; si no, usar hotspot o
  `adb reverse`.
