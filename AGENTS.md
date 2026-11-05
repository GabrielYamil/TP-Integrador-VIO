# AGENTS.md — Contexto fijo del proyecto

Este archivo es el contexto que debe leer cualquier agente que trabaje en el
repositorio. La fuente original del plan es
`Plan de trabajo VIO con celular, marcadores fiduciarios y Foxglove.md`; este
documento resume las decisiones que no se deben cambiar sin consultar.

## Objetivo

Construir un sitio web para Chrome Android que use WebXR `immersive-ar`
(ARCore por debajo) para estimar la pose del celular, detecte AprilTags 36h11
con OpenCV.js en un Web Worker, corrija la deriva con un mapa conocido de
marcadores y publique la pose y la trayectoria en Foxglove Studio mediante un
servidor Node.js.

La entrega es **exclusivamente web**. No se debe proponer una app nativa como
reemplazo ni agregar soporte para iOS.

## 1. Decisiones de arquitectura (fijas)

| Aspecto          | Decisión                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Cliente          | TypeScript + Vite, Chrome Android, WebXR `immersive-ar`                                                      |
| Imagen de cámara | WebXR Raw Camera Access (`camera-access`, `XRWebGLBinding.getCameraImage`)                                   |
| Detección        | AprilTag 36h11 con OpenCV.js 5 (`@techstark/opencv-js`) en Web Worker; plan B `js-aruco2` + PnP propio       |
| Servidor         | Node.js + TypeScript + Express; HTTPS; relay WebSocket seguro; servidor Foxglove con `@foxglove/ws-protocol` |
| Foxglove         | Foxglove Studio de escritorio, conexión `ws://IP_PC:8765`                                                    |
| Corrección       | Fase A: reemplazo directo. Fase B: suavizado configurable. Opcional: Kalman                                  |
| Matemática       | Módulo propio SE(3) en `packages/shared`, sin dependencias pesadas                                           |
| Monorepo         | pnpm workspaces                                                                                              |
| Idioma           | Documentación y UI en español; nombres de código, APIs y tests en inglés                                     |

Versiones fijadas en el repo: TypeScript 5.9.3, Vite 7.3.7, Vitest 3.2.7,
ESLint 9.39.5, zod 3.25.76, Express 5.3.0, Node 22.14, `@types/webxr` 0.5.24,
`tsx` 4.23.15. `@foxglove/ws-protocol` 0.8.0 está deprecado, pero se mantiene
como la opción elegida para la Fase 2. Verificar versiones antes de actualizar
una dependencia mayor.

Flujo de datos:

```text
Celular (Chrome)
  WebXR pose + imagen -> worker de detección -> corrector -> WebSocket (wss)
                                                                  |
                                                                  v
PC: servidor Node (HTTPS + relay) -> servidor Foxglove WS :8765 -> Foxglove Studio
```

## 2. Requisitos y entorno

### Hardware

- Celular Android compatible con ARCore y Chrome actualizado.
- PC y celular en la misma WiFi; si la red aísla clientes, usar hotspot propio
  o `adb reverse`.
- Cable USB para depuración remota.
- Marcadores impresos sobre superficie rígida y cinta métrica o medidor láser.

### Software

- Node.js 22.12 o superior (probado con 22.14), pnpm 11, Git.
- `mkcert` para HTTPS local confiable y su CA instalada en Android.
- Foxglove Studio de escritorio (a partir de la Fase 2).
- Python 3 con `opencv-contrib-python`, `numpy` y `Pillow` para las herramientas
  de marcadores y mapa.
- Opcional: Android Platform Tools (`adb`).

El emulador de Android Studio **no implementa WebXR** y no sirve para validar
`immersive-ar` ni `camera-access`. Esa validación es siempre en un celular real.

## 3. Estructura del repositorio

```text
vio-marker-fusion/
├── AGENTS.md
├── README.md
├── docs/
│   ├── setup.md              # instalación, HTTPS y checklist manual
│   ├── conventions.md        # ejes, unidades, fórmulas y mensajes
│   ├── marker-map.md         # sala demo, impresión y medición real
│   └── results.md            # estado de validación y resultados
├── config/
│   └── marker_map.json       # mapa de marcadores (pose conocida)
├── packages/
│   ├── shared/               # SE(3), convenciones, esquemas, mapa
│   ├── client/               # Vite, WebXR, mock de escritorio
│   └── server/               # HTTPS y, desde Fase 2, relay y Foxglove
├── tools/
│   ├── generate_markers.py   # PNG y PDF A4 de AprilTags
│   ├── make_demo_map.py      # genera el mapa demo
│   └── setup-certs.ps1       # mkcert, CA y firewall
├── certs/                    # generado con mkcert; NO versionar
├── markers/                  # PNG/PDF generados; NO versionar
├── data/runs/                # logs de corridas; NO versionar
└── foxglove/                 # layout exportado (Fase 7)
```

Directorios y artefactos generados que no se versionan: `certs/*.pem`,
`markers/*.png`, `markers/*.pdf`, `data/runs/*.jsonl`, `data/runs/*.mcap` y
todos los `dist/`.

## 4. Convenciones obligatorias

### 4.1. Marcos de referencia

- `world`: ROS/Foxglove, **x adelante, y izquierda, z arriba** (FLU). Origen en
  una esquina del piso de la sala. Metros.
- `odom`: WebXR/ARCore, **x derecha, y arriba, z hacia atrás**. La cámara mira
  hacia `-z`. Origen de la sesión `local-floor`. Metros.
- `camera`: marco de la cámara WebXR, misma orientación que `odom`.
- `cv_camera`: OpenCV, **x derecha, y abajo, z adelante**. La cámara mira hacia
  `+z`. Es la salida de PnP (`T_cam_marker`).
- `marker_<id>`: origen en el centro de la cara visible; **x derecha, y arriba,
  z saliendo de la cara** (regla derecha). `+z` apunta hacia la cámara que lo
  observa.

La cámara de visión usa OpenCV y la de WebXR usa gráficos. La única conversión
entre ambas es `C_WEBXR_CV`; no se debe aplicar dos veces.

### 4.2. Transformaciones y fórmulas

`T_a_b` es la pose del marco `b` en el marco `a`:

```text
p_a = R_a_b * p_b + t_a_b
T_a_c = T_a_b * T_b_c
```

Conversiones fijas:

```text
C_WEBXR_CV = diag(1, -1, -1)              # 180° sobre x
C_ROS_WEBXR.q = [0.5, -0.5, -0.5, 0.5]    # WebXR -> ROS/world
C_ROS_CV = C_ROS_WEBXR * C_WEBXR_CV
```

Transformación inicial para que `world` sea siempre z-arriba:

```text
T_WORLD_ODOM_INITIAL = { p: [0, 0, 0], q: C_ROS_WEBXR.q }
```

La Fase 6 reemplaza esa estimación con la que impone el primer marcador
observado. Antes de eso, la pose "corregida" es la pose inicial rotada a ROS,
no una corrección de mapa.

Fórmulas de corrección:

```text
T_odom_marker = T_odom_cam * C_WEBXR_CV * T_cam_marker
T_world_odom  = T_world_marker * inverse(T_odom_marker)
T_world_cam   = T_world_odom * T_odom_cam
```

Implementación y tests: `packages/shared/src/math/se3.ts`,
`packages/shared/src/conventions/axes.ts`,
`packages/shared/src/markers/correction.ts`.

### 4.3. Unidades y tiempo

- Longitudes: metros. Ángulos: radianes.
- Cuaterniones: `[x, y, z, w]`, unitarios; `q` y `-q` son la misma rotación.
- Timestamps: milisegundos desde el reloj del celular. El servidor agrega su
  timestamp de recepción en la Fase 2.
- Las poses en JSON son `{ "p": [x, y, z], "q": [x, y, z, w] }`.

### 4.4. Mapa de marcadores

Formato obligatorio de `config/marker_map.json`:

```json
{
  "frame_id": "world",
  "dictionary": "APRILTAG_36h11",
  "markers": [
    {
      "id": 0,
      "size_m": 0.16,
      "position": [0.5, 0.0, 1.2],
      "orientation_xyzw": [0, 0, 0, 1]
    }
  ]
}
```

`size_m` es el lado completo del patrón impreso, no el papel. El esquema rechaza
IDs duplicados, `frame_id` distinto de `world`, diccionarios distintos y campos
extra. La sala demo mide 4 × 3 × 2,5 m y tiene 6 marcadores; ver
`docs/marker-map.md`.

### 4.5. Mensajes cliente -> servidor

```json
{ "type": "pose", "t": 1234.5, "raw": { "p": [0, 1.4, 0], "q": [0, 0, 0, 1] }, "corrected": { "p": [0, 0, 1.4], "q": [0.5, -0.5, -0.5, 0.5] }, "tracking": "tracking" }
{ "type": "marker", "t": 1234.5, "id": 3, "T_cam_marker": { "p": [0.1, 0.2, 0.9], "q": [0, 0, 0, 1] }, "reproj_err_px": 0.8 }
{ "type": "correction", "t": 1234.5, "id": 3, "delta_p_m": 0.04, "delta_angle_rad": 0.01 }
{ "type": "hello", "device": "Pixel 8", "intrinsics": { "fx": 500, "fy": 501, "cx": 320, "cy": 240 }, "image_size": [640, 480] }
```

`tracking` es `tracking`, `limited` o `lost`. `corrected` es opcional hasta que
haya corrección de mapa. `T_cam_marker` está en el marco OpenCV. Los esquemas
están en `packages/shared/src/messages/schemas.ts`; usar
`parseClientMessageJson` en el borde del WebSocket y descartar mensajes
inválidos con log.

### 4.6. Canales Foxglove (Fase 2 en adelante)

| Tópico            | Esquema                    | Contenido                                        |
| ----------------- | -------------------------- | ------------------------------------------------ |
| `/tf`             | `foxglove.FrameTransforms` | `world→odom`, `odom→camera`, `world→marker_<id>` |
| `/pose/raw`       | `foxglove.PoseInFrame`     | VIO cruda en `odom`                              |
| `/pose/corrected` | `foxglove.PoseInFrame`     | pose corregida en `world`                        |
| `/markers`        | `foxglove.SceneUpdate`     | marcadores y trayectoria                         |
| `/metrics`        | JSON propio                | corrección, marcadores visibles, FPS, latencia   |

## 5. Estado actual

Fecha de referencia: **2026-11-05**.

- **Fase 0:** implementada en código (monorepo, servidor HTTPS, certificados,
  páginas de diagnóstico, mock y documentación). La validación en celular real
  está **pendiente**: no hay todavía un reporte de `immersive-ar` ni de
  `camera-access` en un dispositivo.
- **Fase 1:** completada. 33 tests en 4 archivos; incluye el caso sintético de
  corrección con deriva y error menor a `1e-6`.
- **Fase 2:** implementada en código a pedido del usuario, sin esperar el cierre
  de la Fase 0. Incluye el relay `/ingest`, la validación zod, el servidor
  Foxglove en `:8765`, los canales `/tf`, `/pose/*`, `/markers` y `/metrics`, y
  el simulador `pnpm sim`. Los 13 tests del servidor pasan. La validación visual
  en Foxglove Studio 3.5.0 se completó el 2026-11-05; el relay con HTTPS real y
  la telemetría del celular siguen **pendientes** para la Fase 3.
- No hay datos de corridas reales, layout de Foxglove ni mapa medido en una
  sala real. La validación móvil de la Fase 0 se retoma cuando haya un celular
  ARCore disponible.

Las verificaciones pendientes están enumeradas en `docs/results.md` y en el
checklist de `docs/setup.md`. El agente no debe inventar resultados de pruebas
en celular.

## 6. Reglas de trabajo

1. **Una fase por vez.** No mezclar cambios de fases distintas en un commit.
   No avanzar sin cumplir los criterios de aceptación.
2. **No inventar APIs.** Ante dudas de WebXR, Foxglove u otra librería, consultar
   documentación oficial y dejar una nota con la fuente en el código.
3. **Constantes físicas en configuración**, no hardcodeadas: tamaños,
   umbrales, frecuencias, intrínsecos, tiempos de suavizado.
4. **Todo cambio de ejes** se refleja en `docs/conventions.md` y en tests.
5. Si algo no se puede probar sin el celular, decirlo explícitamente y listar
   qué hay que verificar a mano.
6. Código tipado, logs útiles con nivel configurable y manejo de errores en
   cada borde: red, permisos, tracking perdido, cámara ausente.
7. La UI y la documentación van en español; el código y los tests en inglés.
8. No versionar certificados, claves, marcadores generados, datos de corridas
   ni builds. Mantener `.gitignore` actualizado.
9. Antes de cerrar un cambio ejecutar `pnpm typecheck`, `pnpm test`, `pnpm lint`,
   `pnpm build` y `pnpm format:check`.
10. Respetar la separación `packages/shared` (sin DOM), `packages/client`
    (navegador) y `packages/server` (Node).

## 7. Comandos

```powershell
pnpm install
pnpm approve-builds --all   # solo si pnpm lo solicita
pnpm cert:setup             # PowerShell elevado; requiere mkcert
pnpm dev                    # Vite :5173 + servidor :8443
pnpm build
pnpm start                  # sirve dist en :8443
pnpm sim                    # simulador contra /ingest
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm markers                # requiere Python/OpenCV/Pillow
pnpm map:demo
```

Para la validación del celular, leer `docs/setup.md`. La IP WiFi no debe
hardcodearse en el código: el script de certificados la detecta y Vite la
muestra al arrancar.

## 8. Riesgos conocidos

| Riesgo                                | Impacto                                   | Alternativa                                                                |
| ------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| El celular no soporta `camera-access` | Bloquea la imagen para detección (Fase 4) | Probar otro dispositivo; VIO solo como degradación; consultar a la cátedra |
| El emulador no implementa WebXR       | No sirve para validar la app              | Usar celular real por `adb` o WiFi                                         |
| Intrínsecos derivados imprecisos      | Error de PnP                              | Calibración propia con tablero y archivo de configuración                  |
| Red universitaria aísla clientes      | El celular no llega a la PC               | Hotspot propio o `adb reverse`                                             |
| Certificado no confiado               | WebXR no inicia                           | Reinstalar `rootCA.pem`, revisar IP/SAN y perfil de red                    |
| Detector WASM lento                   | Baja FPS                                  | Reducir resolución/frecuencia y detectar solo cuando convenga              |
| Ambigüedad de pose plana              | Saltos de orientación                     | Coherencia temporal, filtro de reproyección y múltiples marcadores         |
| Desfase imagen-pose                   | Corrección incorrecta                     | Usar el timestamp del frame XR para la detección                           |

## 9. Referencias internas

- Convenciones y fórmulas: `docs/conventions.md`.
- Instalación, HTTPS y checklist: `docs/setup.md`.
- Mapa demo y medición real: `docs/marker-map.md`.
- Estado de validación: `docs/results.md`.
- Plan completo: `Plan de trabajo VIO con celular, marcadores fiduciarios y Foxglove.md`.
