# Resultados y estado de validación

Última actualización: **2026-11-03**.

Alcance de este informe: **Fase 0 (entorno, HTTPS y prueba AR)** y **Fase 1
(matemática SE(3) y convenciones)**. Las fases 2 a 10 todavía no se
implementaron.

## 1. Resumen

| Fase                          | Estado         | Observación                                                                                              |
| ----------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| 0 — entorno y HTTPS           | **Parcial**    | El circuito PC está verificado. La aceptación depende de la prueba en celular real, que sigue pendiente. |
| 1 — matemática y convenciones | **Completada** | 33 tests automáticos pasan, incluido el caso sintético de corrección.                                    |
| 2 — relay y Foxglove          | No iniciada    | Se espera cerrar la Fase 0 y recibir confirmación.                                                       |

La Fase 0 no se declara cerrada hasta que Chrome Android acepte el certificado
e inicie una sesión `immersive-ar` con tracking. En esta máquina no hay un
celular conectado y `mkcert` no está instalado, así que esa parte no se ejecutó.

## 2. Verificaciones automáticas

Ejecutadas desde la raíz del repositorio:

| Comando             | Resultado                                                       |
| ------------------- | --------------------------------------------------------------- |
| `pnpm typecheck`    | OK en `shared`, `client` y `server`.                            |
| `pnpm test`         | 4 archivos, **33 tests pasaron**.                               |
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

El caso sintético de corrección construye una observación de un marcador,
introduce una deriva conocida en `T_odom_cam` y comprueba que
`T_world_odom` se recupera con error menor a `1e-6`. También verifica que la
pose corregida de la cámara coincide con la pose verdadera.

## 3. Verificación del servidor HTTPS

Se validó el circuito con un certificado autofirmado temporal para
`localhost`, `127.0.0.1` y la IP WiFi de la PC. El certificado y la clave se
borraron después de la prueba; no forman parte del repositorio ni del
procedimiento normal.

| Prueba                                               | Resultado                                               |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `https://localhost:8443/health`                      | HTTP 200, `status: ok`, `tls: true`.                    |
| `https://127.0.0.1:8443/health` con verificación TLS | HTTP 200, certificado válido.                           |
| `/` en `:8443`                                       | HTTP 200.                                               |
| `/ar-test.html` en `:8443`                           | HTTP 200.                                               |
| `/mock.html` en `:8443`                              | HTTP 200.                                               |
| Assets JS/CSS del build                              | HTTP 200.                                               |
| Vite en `https://localhost:5173/`                    | HTTP 200.                                               |
| Proxy `/health` de Vite hacia `:8443`                | HTTP 200 con `tls: true`.                               |
| `pnpm dev` con cliente y servidor                    | Ambos procesos arrancaron y sirvieron las tres páginas. |

### Lo que falta verificar

La prueba anterior demuestra que el servidor y Vite hablan HTTPS, pero **no**
demuestra que el certificado de mkcert esté instalado en Android ni que Chrome
Android lo acepte. Para cerrar la Fase 0 hay que ejecutar el checklist de
`docs/setup.md` con `pnpm cert:setup`, instalar `certs/rootCA.pem` y abrir la
URL desde el celular.

## 4. Herramientas y artefactos

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
- expone `GET /health`;
- usa HTTPS por defecto en el puerto 8443;
- acepta `--http` para pruebas de escritorio;
- no tiene todavía relay WebSocket, `/ingest` ni servidor Foxglove.

## 5. Verificaciones manuales pendientes

Las siguientes pruebas no se pueden hacer sin hardware o sin instalar mkcert.
Quedan registradas como pendientes, no como aprobadas:

- [ ] `pnpm cert:setup` en PowerShell elevado y generación de certificados con
      mkcert.
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

### Cómo registrar el resultado

En `/ar-test.html`, presionar **Copiar reporte** y pegar el JSON en una sección
nueva de este documento, indicando:

- modelo de celular;
- versión de Android y de Chrome;
- versión de Google Play Services for AR;
- fecha y hora de la prueba;
- resultado de `enabledFeatures`;
- errores observados.

No modificar los resultados automáticos sin volver a ejecutar los comandos.

## 6. Limitaciones conocidas

1. **Validación móvil bloqueada:** no hay un celular ARCore conectado en el
   entorno de desarrollo actual.
2. **`camera-access`:** es una feature opcional y puede no estar disponible en
   el dispositivo. Si falla, la Fase 4 queda bloqueada; no se puede resolver con
   tests unitarios.
3. **Emulador:** el emulador de Android Studio no implementa WebXR.
4. **Mapa sintético:** las poses de los marcadores no provienen de una sala
   real y no se comprobó la orientación física.
5. **Foxglove:** todavía no hay servidor ni layout; no se puede visualizar la
   trayectoria en vivo.
6. **mkcert:** requiere instalación y permisos de administrador. El script está
   preparado, pero no se ejecutó en esta máquina.
7. **`@foxglove/ws-protocol` 0.8.0:** está deprecado; se usará igual por la
   decisión del proyecto y se revisará si aparece un problema de compatibilidad.

## 7. Próximo paso

Después de completar el checklist de la sección 5 y confirmar el soporte de
`camera-access`, el siguiente paso es la **Fase 2**:

- relay WebSocket seguro `/ingest`;
- validación zod de los mensajes;
- servidor Foxglove en el puerto 8765;
- publicación de los TF estáticos de los marcadores;
- simulador de cliente para probar sin celular.

No se debe iniciar la Fase 2 antes de cerrar la validación manual de la Fase 0.
