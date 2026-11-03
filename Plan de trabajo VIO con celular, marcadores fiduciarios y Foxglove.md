# Plan de trabajo: VIO con celular, marcadores fiduciarios y Foxglove

Documento pensado para ser entregado a un agente de programación (OpenCode u otro). Cada fase tiene tareas concretas, entregables y criterios de aceptación verificables.

## 0. Cómo usar este documento con el agente

1. Copiá las secciones 1 a 4 en un archivo `AGENTS.md` en la raíz del repo (es el contexto fijo del proyecto).
2. Pedile al agente **una fase por vez** (sección 5), indicando: "Implementá la Fase N. No avances a la siguiente hasta que se cumplan los criterios de aceptación".
3. Después de cada fase, probá vos en el celular real y hacé commit. Los problemas de WebXR y ejes casi nunca se detectan solo con tests unitarios.
4. Las tareas marcadas **\[HUMANO\]** requieren hardware, mediciones o decisiones tuyas; el agente no puede hacerlas.
5. Verificá en la documentación oficial las versiones vigentes de WebXR, Foxglove y las librerías antes de fijarlas (esto cambia con frecuencia).

## 1. Decisiones de arquitectura (fijas)

| Aspecto | Decisión |
| --- | --- |
| Cliente | Página web (TypeScript + Vite) en Chrome para Android, con WebXR `immersive-ar` (usa ARCore por debajo) |
| Imagen de cámara | WebXR Raw Camera Access (`camera-access`) con `XRWebGLBinding.getCameraImage` |
| Detección de marcadores | AprilTag 36h11 o ArUco 4x4 vía WebAssembly (OpenCV.js o un build WASM de AprilTag); corre en un Web Worker |
| Servidor | Node.js + TypeScript: sirve la web por HTTPS, recibe datos del celular por WebSocket seguro (`wss`) y actúa como servidor Foxglove WebSocket (`@foxglove/ws-protocol`) |
| Visualización | Foxglove Studio (app de escritorio, conexión `ws://IP_PC:8765`) |
| Corrección | Fase A: reemplazo directo. Fase B: corrección suavizada. Opcional: filtro de Kalman |
| Lenguaje de matemática | Módulo propio de transformaciones SE(3) con tests, sin dependencias pesadas (puede usarse `gl-matrix` o `three`) |

Flujo de datos:

```
Celular (Chrome)
  WebXR pose + imagen ──► worker de detección ──► corrector ──► WebSocket (wss)
                                                                    │
                                                                    ▼
PC: servidor Node (HTTPS + relay) ──► servidor Foxglove WS :8765 ──► Foxglove Studio
```

## 2. Requisitos y qué hay que tener o instalar

### Hardware

- Celular Android compatible con ARCore (ver lista oficial de dispositivos) y con Chrome actualizado. \[HUMANO\]
- PC con Windows, macOS o Linux, en la **misma red WiFi** que el celular (algunas redes de universidad aíslan clientes: tener un router propio o hotspot como plan B).
- Cable USB para depuración remota (`chrome://inspect`). Muy recomendado.
- Marcadores impresos sobre superficie rígida, cinta métrica o medidor láser. \[HUMANO\]

### Software en el celular

- Chrome para Android actualizado.
- *Google Play Services for AR* instalado (se pide al iniciar la primera sesión).
- Opciones de desarrollador y depuración USB activadas.

### Software en la PC

- Node.js LTS y npm (o pnpm), Git.
- `mkcert` para certificados HTTPS locales confiables. El celular debe instalar la CA raíz de mkcert (o usar un túnel como alternativa); Chrome exige contexto seguro para WebXR.
- Foxglove Studio (app de escritorio). La versión web no puede conectarse a `ws://` de otra máquina desde una página HTTPS.
- Opcional: Python 3 con OpenCV (`opencv-contrib-python`) para generar marcadores y validar la detección fuera del navegador.
- Android Platform Tools (`adb`) para depuración y `adb reverse` como alternativa de red.

### Dependencias de Node previstas (verificar versiones)

- Servidor: `express` o `fastify`, `ws`, `@foxglove/ws-protocol`, `tsx`, `typescript`, `vitest`.
- Cliente: `vite`, `typescript`, `gl-matrix` (o `three`), una librería de detección (`js-aruco2`, `opencv.js` o `apriltag` WASM), `vitest`.

## 3. Estructura del repositorio

```
vio-marker-fusion/
├── AGENTS.md
├── README.md
├── docs/
│   ├── conventions.md        # ejes, unidades, mensajes
│   ├── marker-map.md         # cómo medir el mapa
│   └── results.md            # resultados de evaluación
├── config/
│   └── marker_map.json       # mapa de marcadores (pose conocida)
├── packages/
│   ├── shared/               # tipos TS, esquemas de mensajes, matemática SE(3)
│   ├── client/               # web para celular (WebXR, detección, corrección)
│   └── server/               # HTTPS + relay + servidor Foxglove
├── foxglove/
│   └── layout.json           # layout exportado de Foxglove Studio
├── tools/
│   ├── generate_markers.py   # genera imágenes de marcadores para imprimir
│   └── analyze_run.ts        # métricas desde logs
├── certs/                    # generados con mkcert (NO versionar)
└── data/
    └── runs/                 # logs de recorridos para evaluación
```

## 4. Convenciones (el agente debe respetarlas siempre)

### Marcos de referencia

- `world`: marco del mapa. Convención ROS/Foxglove: **x adelante, y izquierda, z arriba**, metros. Origen en una esquina del piso de la sala.
- `odom`: marco de WebXR/ARCore. Convención WebXR: **x derecha, y arriba, z hacia atrás (la cámara mira hacia -z)**.
- `camera`: marco de la cámara del dispositivo (pose de WebXR en `odom`).
- `marker_<id>`: marco de cada marcador. Origen en el centro, z saliendo de la cara visible.
- La cámara de visión (OpenCV) usa **x derecha, y abajo, z hacia adelante**. Debe existir una única función de conversión documentada, con tests.

### Transformaciones

Notación `T_a_b` = pose del marco b expresada en el marco a. Fórmulas de corrección:

```
T_odom_marker = T_odom_cam * C_webxr_cv * T_cam_marker
T_world_odom  = T_world_marker * inverse(T_odom_marker)
T_world_cam   = T_world_odom * T_odom_cam      # pose corregida
```

donde `C_webxr_cv` es la rotación fija entre los ejes de WebXR y los de OpenCV, y `T_cam_marker` sale de la estimación PnP. Además hace falta una rotación fija `T_world_odom_initial` (WebXR y-arriba a ROS z-arriba).

### Unidades y tiempo

- Metros, radianes (o cuaterniones), segundos. Cuaterniones en orden `x, y, z, w`.
- Timestamps en milisegundos desde el reloj del celular (`performance.now()` o el `time` del frame XR); el servidor agrega su propio timestamp de recepción y estima el desfase.

### Formato del mapa (`config/marker_map.json`)

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

### Mensajes cliente → servidor (JSON por WebSocket)

```json
{ "type": "pose",   "t": 1234.5, "raw":  {"p":[x,y,z], "q":[x,y,z,w]}, "corrected": {"p":[...], "q":[...]}, "tracking": "tracking|limited|lost" }
{ "type": "marker", "t": 1234.5, "id": 3, "T_cam_marker": {"p":[...], "q":[...]}, "reproj_err_px": 0.8 }
{ "type": "correction", "t": 1234.5, "id": 3, "delta_p_m": 0.04, "delta_angle_rad": 0.01 }
{ "type": "hello", "device": "...", "intrinsics": {...}, "image_size": [w, h] }
```

### Canales Foxglove (servidor → Studio)

| Tópico | Esquema | Contenido |
| --- | --- | --- |
| `/tf` | `foxglove.FrameTransforms` | `world→odom` (corrección), `odom→camera` (pose VIO), `world→marker_<id>` (mapa) |
| `/pose/raw` | `foxglove.PoseInFrame` | VIO cruda en `odom` |
| `/pose/corrected` | `foxglove.PoseInFrame` | pose corregida en `world` |
| `/markers` | `foxglove.SceneUpdate` | cubos/etiquetas de los marcadores y trayectoria como línea |
| `/metrics` | JSON propio | magnitud de corrección, marcadores visibles, FPS, latencia |

## 5. Fases de implementación

### Fase 0: Preparación del entorno \[HUMANO + agente\]

**Tareas**

- Instalar lo listado en la sección 2.
- Crear el repo con workspaces (npm/pnpm), TypeScript estricto, ESLint y Vitest.
- Generar certificados con `mkcert` para la IP local de la PC y `localhost`; instalar la CA en el celular.
- Verificar en el celular que Chrome soporta `immersive-ar` y `camera-access` (usar una página de prueba mínima).

**Criterio de aceptación:** una página "hola mundo" servida por HTTPS desde la PC abre en Chrome del celular sin advertencias de certificado, y un botón "Probar AR" inicia una sesión `immersive-ar`.

### Fase 1: Matemática SE(3) y convenciones (paquete `shared`)

**Tareas**

- Implementar: composición, inversa, conversión cuaternión↔matriz, conversión pose↔`Float32Array` de WebXR, y conversiones de ejes (WebXR↔OpenCV↔ROS).
- Documentar todo en `docs/conventions.md`.
- Escribir tests unitarios con casos conocidos: identidad, inversa (`T * T⁻¹ = I`), composición asociativa, rotación de 90° sobre cada eje, y el caso sintético "marcador observado en posición conocida devuelve la `T_world_cam` esperada".

**Criterio de aceptación:** todos los tests pasan; hay un test que simula un `T_odom_cam` con deriva conocida y verifica que la fórmula de la sección 4 recupera la `T_world_odom` correcta con error menor a 1e-6.

### Fase 2: Servidor (HTTPS + relay + Foxglove)

**Tareas**

- Servidor HTTPS que sirva `packages/client` (en desarrollo, proxy a Vite o archivos estáticos).
- Endpoint WebSocket seguro `/ingest` para el celular, con validación de mensajes (esquemas con `zod` o similar) y descarte de mensajes inválidos con log.
- Servidor Foxglove WebSocket en el puerto 8765 que anuncie los canales de la sección 4 (con esquemas JSON o los esquemas oficiales de Foxglove).
- Publicación de los TF estáticos de los marcadores al cargar `marker_map.json`.
- Un **simulador de cliente** (script Node) que envíe una trayectoria sintética (círculo o cuadrado) para probar el servidor sin celular.

**Criterio de aceptación:** al ejecutar servidor + simulador, Foxglove Studio (conexión "Foxglove WebSocket") muestra en el panel 3D el marco `world`, los marcadores del mapa y la cámara moviéndose según la trayectoria sintética.

### Fase 3: Cliente WebXR, pose cruda

**Tareas**

- Pantalla de inicio con botón "Iniciar AR", verificación de soporte y mensajes de error claros.
- Sesión `immersive-ar` solicitando `local-floor` (con fallback a `local`) y `camera-access` como característica opcional.
- Bucle de frames: leer `XRViewerPose`, convertir a la convención de `shared`, obtener estado de tracking.
- Overlay DOM (`dom-overlay`) con estado: tracking, FPS, estado de conexión, número de marcadores.
- Cliente WebSocket con reconexión automática y buffer acotado de mensajes.
- Envío de mensajes `pose` a \~30 Hz.

**Criterio de aceptación:** caminando con el celular, la pose en Foxglove se mueve de forma fluida y consistente con el movimiento real (adelante, giros, subir/bajar). Los ejes están bien: avanzar hacia adelante hace avanzar el marco en la dirección esperada.

### Fase 4: Imagen de cámara e intrínsecos

**Tareas**

- Obtener la textura de cámara con `XRWebGLBinding.getCameraImage(view.camera)`, copiarla a un framebuffer y leer los píxeles (`readPixels`) a un buffer en escala de grises, en una resolución reducida configurable (por ejemplo 640×480).
- Obtener los intrínsecos: derivarlos de la matriz de proyección del `XRView` y el tamaño de la imagen. **Verificar** que el resultado sea coherente, y dejar preparada una vía de calibración propia (calibración con tablero en Python/OpenCV y carga desde `config/camera_intrinsics.json`) si la derivación resulta imprecisa.
- Si `camera-access` no está disponible en el dispositivo, mostrar un aviso y dejar un modo de degradación (solo VIO).

**Criterio de aceptación:** la app puede mostrar en pantalla (modo debug) la imagen en escala de grises que se envía al detector, con la orientación correcta y con tasa estable (al menos 10 Hz).

### Fase 5: Detección de marcadores y pose relativa

**Tareas**

- Integrar la librería de detección en un Web Worker; pasar imágenes con `postMessage` y transferibles para evitar copias.
- Detectar esquinas y IDs; filtrar por IDs presentes en el mapa; descartar detecciones con error de reproyección alto.
- Resolver PnP (`solvePnP` de OpenCV.js o equivalente) con el tamaño real del marcador y los intrínsecos; manejar la **ambigüedad de pose** de marcadores planos (por ejemplo descartando soluciones con error de reproyección similar y orientación inestable, o exigiendo coherencia temporal).
- Dibujar en modo debug los contornos, IDs y ejes sobre la imagen.
- Limitar la tasa de detección (por ejemplo 5-10 Hz) para no degradar el tracking.
- Enviar mensajes `marker` al servidor.

**Criterio de aceptación:** con un marcador a 1 m de distancia medido con cinta, la distancia estimada tiene un error menor a 3 cm; los ejes dibujados sobre el marcador son coherentes con su orientación real.

### Fase 6: Corrección de localización

**Tareas**

- Cargar `marker_map.json` en el cliente.
- **Estrategia A (reemplazo):** ante cada detección válida calcular `T_world_odom` con la fórmula de la sección 4 y aplicarla de inmediato.
- **Estrategia B (suavizado):** interpolar hacia el nuevo `T_world_odom` (SLERP para rotación, interpolación lineal para posición) con una constante de tiempo configurable, y rechazar *outliers* (saltos mayores que un umbral, detecciones con alto error de reproyección).
- **Opcional C:** filtro de Kalman sobre `T_world_odom` o promedio ponderado de varios marcadores visibles simultáneamente.
- Inicialización: con el primer marcador visto se fija `T_world_odom`; hasta entonces, `world = odom` con aviso.
- Selector de estrategia en la interfaz y por parámetro de URL, para poder comparar en las pruebas.
- Publicar pose cruda, pose corregida y mensajes `correction`.

**Criterio de aceptación:** al mover el celular lejos de un marcador y volver a mostrarlo, la trayectoria corregida se reubica en el mapa; con A se ve un salto y con B una transición gradual, y ambos se visualizan en Foxglove como dos trayectorias distintas.

### Fase 7: Visualización en Foxglove

**Tareas**

- Publicar la trayectoria como `SceneUpdate` con línea (cruda en rojo, corregida en verde) y marcadores como cubos con etiqueta de ID.
- Armar el layout: panel 3D (marco de referencia `world`), panel Plot (magnitud de corrección, error si hay referencia), panel Raw Messages (`/metrics`), panel de estado.
- Exportar el layout a `foxglove/layout.json` y documentar cómo importarlo.

**Criterio de aceptación:** importar el layout en una instalación limpia de Foxglove Studio y ver todo funcionando sin configuración manual adicional.

### Fase 8: Registro de datos y herramientas de evaluación

**Tareas**

- Grabar cada corrida en `data/runs/<fecha>.jsonl` (poses crudas, corregidas, detecciones, configuración usada). Opcional: grabar también en MCAP desde el servidor para reproducir en Foxglove.
- Script `tools/analyze_run.ts` que calcule: deriva (error de cierre al volver al origen), error de posición en los puntos de verificación marcados en el piso, latencia extremo a extremo, tasa de actualización y porcentaje de tiempo con marcadores visibles.
- Generar gráficos (CSV o imágenes) para el informe.

**Criterio de aceptación:** ejecutar el script sobre una corrida real produce una tabla con las métricas y los gráficos.

### Fase 9: Pruebas en la sala y evaluación \[HUMANO\]

**Tareas**

- Imprimir e instalar los marcadores según el diseño de la sala; medir y cargar el mapa en `marker_map.json`; marcar los puntos de verificación en el piso.
- Ejecutar los experimentos, repitiendo cada uno al menos 3 veces:
  1. VIO sola: recorrido cerrado, medir error de cierre.
  2. VIO + corrección A.
  3. VIO + corrección B.
  4. Variación de condiciones: distancia, ángulo de observación, iluminación, marcadores ocultos.
- Documentar los resultados en `docs/results.md` con tablas y gráficos, e identificar limitaciones.

**Criterio de aceptación:** existe una comparación cuantitativa clara con y sin corrección, con al menos tres repeticiones por condición.

### Fase 10: Documentación y entrega

**Tareas**

- `README.md` con instalación, comandos, red, certificados, y solución de problemas frecuentes.
- Informe técnico: marco teórico, decisiones de diseño, convenciones de ejes, resultados, limitaciones y trabajo futuro.
- Video o demo en vivo (guion de la sección 6 del documento anterior).

## 6. Pruebas automatizadas mínimas

- **Unitarias (Vitest):** matemática SE(3), conversión de ejes, corrección con datos sintéticos, validación de mensajes, interpolación.
- **Integración:** simulador de cliente + servidor, verificando que los canales Foxglove publican mensajes con el esquema correcto (cliente WebSocket de prueba).
- **Manuales (checklist):** sesión AR inicia, tracking estable, detección con distintos IDs, reconexión de WebSocket tras cortar el WiFi, comportamiento cuando el tracking se pierde.

## 7. Reglas que debe seguir el agente

- Una fase por vez; no mezclar cambios de fases distintas en un mismo commit.
- No inventar APIs: ante duda sobre WebXR, Foxglove o una librería, consultar la documentación oficial y dejar una nota en el código con la fuente.
- Toda constante física (tamaños, umbrales, frecuencias) va en configuración, no hardcodeada.
- Todo cambio de convención de ejes se refleja en `docs/conventions.md` y en los tests.
- Si algo no se puede probar sin el celular, el agente debe decirlo explícitamente y listar qué hay que verificar a mano.
- Código tipado, con logs útiles (nivel configurable) y manejo de errores en cada borde (red, permisos, tracking perdido).

## 8. Riesgos y planes alternativos

| Riesgo | Alternativa |
| --- | --- |
| El celular no soporta `camera-access` | Probar otro dispositivo; o app nativa con ARCore SDK (consultar a la cátedra si es aceptable) |
| Intrínsecos derivados imprecisos | Calibración propia con tablero y archivo de configuración |
| El detector en WASM es lento | Reducir resolución y frecuencia, o ejecutar solo cuando el marcador probablemente es visible |
| La red de la universidad bloquea tráfico entre dispositivos | Router/hotspot propio o `adb reverse` por USB |
| Certificados HTTPS problemáticos | Túnel HTTPS (por ejemplo con una herramienta de túneles) solo para servir la web, manteniendo el relay en la red local |
| Desfase entre imagen y pose | Usar el timestamp del frame XR y la pose de ese mismo frame para la detección |

## 9. Orden recomendado y estimación orientativa

| Fase | Esfuerzo orientativo |
| --- | --- |
| 0-1 | 1 a 2 días |
| 2-3 | 2 a 3 días |
| 4-5 | 3 a 5 días (la parte más incierta) |
| 6-7 | 2 a 3 días |
| 8-9 | 3 a 4 días |
| 10 | 2 a 3 días |

La ruta crítica es **Fase 4 (imagen de cámara)**: conviene validarla lo antes posible, incluso antes de terminar la Fase 2, porque si el dispositivo no entrega la imagen hay que replantear el diseño.
