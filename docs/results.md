# Resultados y estado de validación

Última actualización: **2026-11-06**.

Alcance de este informe: **Fase 0 (entorno, HTTPS y prueba AR)**, **Fase 1
(matemática SE(3) y convenciones)** y **Fase 2 (relay y Foxglove)**. Las fases 3
a 10 todavía no se implementaron.

## 1. Resumen

| Fase                          | Estado         | Observación                                                                                                              |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 0 — entorno y HTTPS           | **Parcial**    | El circuito PC está verificado. La aceptación depende de la prueba en celular real, que sigue pendiente.                 |
| 1 — matemática y convenciones | **Completada** | 33 tests automáticos pasan, incluido el caso sintético de corrección.                                                    |
| 2 — relay y Foxglove          | **Completada** | 13 tests del servidor. Foxglove Studio 3.5.0 el 2026-11-05 y relay HTTPS el 2026-11-06. Falta la telemetría del celular. |

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

## 2. Verificaciones automáticas

Ejecutadas desde la raíz del repositorio:

| Comando             | Resultado                                                       |
| ------------------- | --------------------------------------------------------------- |
| `pnpm typecheck`    | OK en `shared`, `client` y `server`.                            |
| `pnpm test`         | 7 archivos, **46 tests pasaron** (33 shared + 13 server).       |
| `pnpm lint`         | OK, sin errores.                                                |
| `pnpm build`        | OK. El cliente multipágina se generó en `packages/client/dist`. |
| `pnpm format:check` | OK después de aplicar Prettier.                                 |

### Detalle de los tests

| Archivo                                        | Tests | Cobertura principal                                                                         |
| ---------------------------------------------- | ----: | ------------------------------------------------------------------------------------------- |
| `packages/shared/src/math/se3.test.ts`         |    12 | Composición, inversa, rotaciones de 90°, round-trip WebXR, corrección sintética con deriva. |
| `packages/shared/src/conventions/axes.test.ts` |     6 | `C_WEBXR_CV`, `C_ROS_WEBXR`, `C_ROS_CV` y sus inversas.                                     |
| `packages/shared/src/markers/map.test.ts`      |     9 | Esquema del mapa, IDs duplicados, `markerPoseOnWall` y geometría del mapa demo.             |
| `packages/shared/src/messages/schemas.test.ts` |     6 | Validación de mensajes `pose`, `marker`, `correction` y `hello`.                            |
| `packages/server/src/foxglove.test.ts`         |     4 | Conversión ms→ns, canales JSON Schema, TF, escena, métricas y snapshot al suscribirse.      |
| `packages/server/src/ingest.test.ts`           |     2 | Mensajes válidos, inválidos y binarios; rechazo de otra ruta WebSocket.                     |
| `packages/server/src/sim-client.test.ts`       |     7 | Argumentos, trayectorias círculo/cuadrado, deriva y mensaje `hello`.                        |

El caso sintético de corrección construye una observación de un marcador,
introduce una deriva conocida en `T_odom_cam` y comprueba que
`T_world_odom` se recupera con error menor a `1e-6`. También verifica que la
pose corregida de la cámara coincide con la pose verdadera.

El test de integración de Foxglove levanta un `FoxgloveServer` en un puerto
efímero, conecta un `FoxgloveClient`, se suscribe a los cinco canales y verifica
el contenido de `/pose/raw`, `/pose/corrected`, `/tf`, `/markers` y `/metrics`.
Incluye una pose sin `corrected` para comprobar el uso de
`T_WORLD_ODOM_INITIAL`.

## 3. Verificación del servidor HTTPS

El **2026-11-06** se instaló `mkcert` 1.4.4 con `winget` y se ejecutó
`pnpm cert:setup`. Se generaron certificados para `localhost`, `127.0.0.1`,
`::1` y las IPv4 LAN detectadas (`192.168.1.18`, `192.168.56.1` y
`172.19.144.1`). La CA quedó en `certs/rootCA.pem`, lista para instalar en
Android. El servidor y Vite se validaron de nuevo con estos certificados.

| Prueba                                               | Resultado                                                |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `https://localhost:8443/health`                      | HTTP 200, `status: ok`, `tls: true`.                     |
| `https://127.0.0.1:8443/health` con verificación TLS | HTTP 200, certificado válido.                            |
| `/` en `:8443`                                       | HTTP 200.                                                |
| `/ar-test.html` en `:8443`                           | HTTP 200.                                                |
| `/mock.html` en `:8443`                              | HTTP 200.                                                |
| Assets JS/CSS del build                              | HTTP 200.                                                |
| Vite en `https://localhost:5173/`                    | HTTP 200.                                                |
| Proxy `/health` de Vite hacia `:8443`                | HTTP 200 con `tls: true`.                                |
| `pnpm dev` con cliente y servidor                    | Ambos procesos arrancaron y sirvieron las tres páginas.  |
| Relay `wss://localhost:8443/ingest`                  | 37 mensajes válidos, 0 inválidos; CA de mkcert aceptada. |

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

## 5. Herramientas y artefactos

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
- incluye `pnpm sim` como cliente de prueba.

## 6. Verificaciones manuales pendientes

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
- [ ] La sesión entrega tracking y FPS estables.
- [ ] `camera-access` se habilita y `getCameraImage` devuelve una textura.
- [ ] El modo mock abre la webcam en la PC y la pose simulada responde al
      teclado.
- [ ] La orientación de los ejes de WebXR coincide con el movimiento real
      (adelante, giros y vertical).
- [ ] Se guardó el reporte JSON de `/ar-test.html` como evidencia.
- [ ] La telemetría real del celular llega por `wss://` al relay.

### Cómo registrar el resultado

En `/ar-test.html`, presionar **Copiar reporte** y pegar el JSON en una sección
nueva de este documento, indicando:

- modelo de celular;
- versión de Android y de Chrome;
- versión de Google Play Services for AR;
- fecha y hora de la prueba;
- resultado de `enabledFeatures`;
- errores observados.

La prueba de Foxglove del 2026-11-05 quedó registrada en la sección 4.3 con la
versión 3.5.0 y la URL de conexión. Para futuras corridas, agregar una captura
del panel 3D con las dos trayectorias.

No modificar los resultados automáticos sin volver a ejecutar los comandos.

## 7. Limitaciones conocidas

1. **Validación móvil bloqueada:** no hay un celular ARCore conectado en el
   entorno de desarrollo actual.
2. **`camera-access`:** es una feature opcional y puede no estar disponible en
   el dispositivo. Si falla, la Fase 4 queda bloqueada; no se puede resolver con
   tests unitarios.
3. **Emulador:** el emulador de Android Studio no implementa WebXR.
4. **Mapa sintético:** las poses de los marcadores no provienen de una sala
   real y no se comprobó la orientación física.
5. **Foxglove Studio:** validado en escritorio con la versión 3.5.0; falta la
   telemetría real del celular y una captura de evidencia.
6. **Relay HTTPS:** validado con `wss://localhost:8443/ingest` y la CA de mkcert.
   Falta repetirlo desde el celular por la IP LAN.
7. **mkcert:** instalado y con certificados generados; la CA todavía no está
   instalada en Android y las reglas de firewall requieren una consola elevada.
8. **`@foxglove/ws-protocol` 0.8.0:** está deprecado; se usa igual por la
   decisión del proyecto y se revisará si aparece un problema de compatibilidad.

## 8. Próximo paso

1. Instalar `certs/rootCA.pem` en el celular y crear las reglas de firewall en
   una consola elevada.
2. Completar el checklist de la Fase 0 cuando haya un celular ARCore.
3. Avanzar a la Fase 3 (pose cruda en vivo desde el cliente) una vez cerrada la
   Fase 0.
4. Repetir el relay por la IP LAN durante la integración del celular.

La Fase 2 está cerrada, incluido el relay HTTPS con mkcert, y no bloquea la
Fase 3 desde el punto de vista del código. El proyecto mantiene la regla de
cerrar una fase antes de iniciar la siguiente.
