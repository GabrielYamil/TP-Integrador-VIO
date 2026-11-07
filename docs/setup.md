# Puesta en marcha

Esta guía cubre la instalación, los certificados HTTPS, la ejecución local, la
verificación de la Fase 0, la prueba del relay y Foxglove de la Fase 2 y el
cliente AR de las fases 3 y 4. La validación en el celular es obligatoria: el
emulador de Android Studio no implementa WebXR y no sirve para aceptar la
Fase 0, la Fase 3 ni la Fase 4.

## 1. Requisitos

### PC

- Windows 10/11 con PowerShell 5.1 o posterior.
- Node.js **22.12 o superior** (probado con 22.14).
- pnpm 11 (probado con 11.1.3).
- Git.
- `mkcert` para generar una CA local y un certificado aceptado por el celular.
- Python 3 con `opencv-contrib-python`, `numpy` y `Pillow` si se van a regenerar
  los marcadores o el mapa demo.
- Foxglove Studio es necesario recién a partir de la Fase 2.

### Celular

- Android compatible con ARCore y con Google Play Services for AR instalado.
- Chrome para Android actualizado.
- El celular y la PC en la misma red WiFi, sin aislamiento de clientes.
- Cable USB y `adb` son opcionales, pero muy recomendables para depurar con
  `chrome://inspect` y para usar `adb reverse` si la red bloquea la conexión.

El proyecto no contempla iOS ni una app nativa: la única vía de entrega es el
sitio web con WebXR/ARCore.

## 2. Instalación del proyecto

Desde la raíz del repositorio:

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm install` puede pedir aprobación para scripts de build. Si aparece el aviso
de pnpm, aprobá esbuild:

```powershell
pnpm approve-builds --all
```

Los artefactos generados no se versionan. Después de clonar el repo hay que
regenerar los marcadores y el mapa demo si no están presentes:

```powershell
pnpm markers
pnpm map:demo
```

### Dependencias de Python para las herramientas

```powershell
python -m pip install opencv-contrib-python numpy pillow
```

`pnpm markers` escribe `markers/marker_XX_idX.png` y `markers/markers_A4.pdf`.
`pnpm map:demo` vuelve a generar `config/marker_map.json` para la sala demo.

## 3. Certificados HTTPS

WebXR exige un contexto seguro. `http://IP_DE_LA_PC` no alcanza en el celular:
Chrome necesita HTTPS con un certificado en el que confíe el dispositivo.

### 3.1. Instalar mkcert

En una terminal normal:

```powershell
winget install --id FiloSottile.mkcert --scope user
```

Cerrá y volvé a abrir la terminal para que se actualice el `PATH`. Verificá:

```powershell
mkcert -version
```

### 3.2. Generar el certificado y la CA

Abrí PowerShell **como administrador** y ejecutá:

```powershell
pnpm cert:setup
```

El script `tools/setup-certs.ps1`:

1. Ejecuta `mkcert -install` para agregar la CA local al almacén de Windows.
2. Genera `certs/dev-cert.pem` y `certs/dev-key.pem` para `localhost`,
   `127.0.0.1`, `::1` y todas las IPv4 LAN detectadas.
3. Copia la CA a `certs/rootCA.pem` para instalarla en Android.
4. Crea reglas de firewall para TCP 5173, 8443 y 8765 en el perfil privado, si
   la consola está elevada.

Si ejecutás el script sin elevación, los certificados y la CA se generan igual,
pero las reglas de firewall no se crean; el script imprime el bloque
`New-NetFirewallRule` para ejecutarlo aparte en una consola de administrador.

Si cambia la IP de la PC, volvé a ejecutar `pnpm cert:setup`.

> Los archivos de `certs/` son secretos locales y están ignorados por git. No
> los subas al repositorio ni los compartas.

### 3.3. Instalar la CA en el celular

1. Copiá `certs/rootCA.pem` al celular por USB, Drive o el método que prefieras.
   Con `adb`:

   ```powershell
   adb push certs/rootCA.pem /sdcard/Download/rootCA.pem
   ```

2. En Android, instalá el archivo como **certificado de CA de usuario**. El
   camino exacto cambia según la marca y la versión:
   - Pixel/Android reciente: **Ajustes > Seguridad > Más ajustes de seguridad >
     Cifrado y credenciales > Instalar un certificado > Certificado de CA**.
   - Samsung: **Ajustes > Biometría y seguridad > Otros ajustes de seguridad >
     Instalar desde almacenamiento > Certificado de CA**.
3. Android muestra una advertencia porque una CA de usuario puede inspeccionar
   tráfico. Es esperable en este entorno de desarrollo; aceptá.
4. Si el selector de archivos no muestra el `.pem`, probá renombrarlo a
   `rootCA.crt` antes de copiarlo. El contenido PEM de mkcert es el mismo.
5. Reiniciá Chrome si ya estaba abierto.

El certificado del servidor tiene que incluir la IP exacta que vas a usar. El
script toma las IPs al momento de ejecutarse; si ves `192.168.56.1`
(VirtualBox) y `192.168.1.18` (WiFi), la que necesita el celular es la de la
interfaz WiFi.

### 3.4. Firewall y red

- La red de Windows debe estar configurada como **Privada** para que apliquen
  las reglas del script. Verificá con:

  ```powershell
  Get-NetConnectionProfile
  ```

- Si el perfil es `Public`, cambialo desde **Configuración > Red e Internet >
  WiFi > Propiedades de la red** o, como administrador:

  ```powershell
  Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
  ```

- Aceptá el aviso de Windows Firewall para Node.js si aparece.
- Muchas redes universitarias o de invitados aíslan a los clientes. En ese caso
  usá un hotspot propio o `adb reverse` (sección 8).

## 4. Ejecutar la aplicación

### Desarrollo con recarga en caliente

```powershell
pnpm dev
```

Se levantan dos procesos:

- Vite en `https://IP_DE_LA_PC:5173/` (cliente, HMR y proxy de `/health` y
  `/ingest`).
- Servidor Node en `https://IP_DE_LA_PC:8443/` (TLS, `/health`, relay `/ingest`
  y servidor Foxglove en `ws://IP_DE_LA_PC:8765`).

En el celular abrí la URL de Vite:

```text
https://192.168.1.18:5173/
```

Usá la IP que muestra Vite en `Network`, no una IP de VirtualBox.

### Build servido por el servidor

```powershell
pnpm build
pnpm start
```

El servidor sirve `packages/client/dist` en `https://IP_DE_LA_PC:8443/` y
publica Foxglove en `ws://IP_DE_LA_PC:8765`.
`pnpm preview` hace el build y arranca el servidor en un solo paso.

Para desarrollo exclusivamente de escritorio, sin certificados, se puede
levantar el build por HTTP:

```powershell
pnpm build
pnpm --filter @vio/server start -- --http
```

Esto abre `http://localhost:8443/` y **no** sirve para probar WebXR en el
celular. El modo mock de Vite se puede abrir con `pnpm dev:client` en la URL que
muestre Vite: `http://localhost:5173/mock.html` si no hay certificados, o
`https://localhost:5173/mock.html` si los hay.

### Páginas disponibles

| Página         | Ruta            | Uso                                              |
| -------------- | --------------- | ------------------------------------------------ |
| Inicio         | `/`             | Estado del entorno y accesos.                    |
| Cliente AR     | `/ar.html`      | Fases 3 y 4: pose, cámara en gris e intrínsecos. |
| Diagnóstico AR | `/ar-test.html` | Prueba real de `immersive-ar` y `camera-access`. |
| Mock           | `/mock.html`    | Webcam y pose simulada en escritorio.            |
| Salud          | `/health`       | JSON del servidor, la ingesta y Foxglove.        |

## 5. Verificación en la PC

1. Abrí `https://localhost:8443/health`. Debe devolver un JSON con
   `"status":"ok"` y `"tls":true`.
2. Abrí `https://localhost:5173/`. No debe haber advertencia de certificado.
3. Comprobá que la página de inicio muestre:
   - contexto seguro;
   - `navigator.xr` disponible si el navegador de escritorio lo expone;
   - servidor disponible.
4. Abrí `/mock.html` y activá la webcam. La pose simulada debe actualizarse y
   el dibujo cenital debe responder a `W`, `A`, `S`, `D`, `Q` y `E`.
5. En `/ar-test.html`, desde la PC, la sesión AR probablemente no esté
   soportada. Eso no invalida la prueba: la sesión se valida en el celular.
6. En `/ar.html`, desde la PC, la sesión AR también puede no estar soportada,
   pero el relay debe figurar como **conectado**. Eso confirma que el cliente
   WebSocket y el proxy `/ingest` funcionan antes de probar en el celular.
7. Comprobá el endpoint de calibración:

   ```powershell
   curl.exe -k -i https://localhost:8443/config/camera_intrinsics.json
   ```

   Sin `config/camera_intrinsics.json` debe responder **404** con
   `camera_intrinsics_not_found`. Si copiás el ejemplo como
   `config/camera_intrinsics.json` y reiniciás el servidor, debe responder
   **200** con `image_size` e `intrinsics`; `/health` debe mostrar
   `camera_intrinsics.available: true`.

## 6. Relay, Foxglove y cliente AR (Fases 2 a 4)

Esta verificación no necesita el celular: usa el simulador y Foxglove Studio de
escritorio. El cliente AR de las fases 3 y 4 se prueba en la sección 7.

1. Dejá el servidor corriendo con `pnpm dev` o, para la versión compilada,
   `pnpm build` seguido de `pnpm start`.
2. Abrí `https://localhost:8443/health` y comprobá que aparezcan los bloques
   `ingest` y `foxglove` con el puerto 8765.
3. En otra terminal, enviá una trayectoria de prueba:

   ```powershell
   pnpm sim -- --trajectory circle --drift --duration 15
   ```

   Sin `--duration` el simulador corre hasta `Ctrl+C`. El script usa
   `certs/rootCA.pem` automáticamente si existe; con un certificado no confiado
   se puede agregar `--insecure` solo para pruebas locales.

4. Confirmá en `/health` que `messagesValid` aumentó, que `messagesInvalid`
   quedó en 0 y que `byType.pose` es mayor que 0.
5. Abrí Foxglove Studio → **Open connection** → **Foxglove WebSocket** → URL
   `ws://IP_DE_LA_PC:8765`.
6. Suscribite a `/tf`, `/pose/raw`, `/pose/corrected`, `/markers` y `/metrics`.
7. En el panel 3D verificá:
   - el árbol `world → odom → camera`;
   - los seis marcadores del mapa demo;
   - la trayectoria cruda en rojo (`odom`) y la corregida en verde (`world`);
   - el cubo y la etiqueta de cada marcador.
8. En `/metrics` verificá `tracking`, `fps`, `visible_markers` y
   `processing_latency_ms`.

### Flags del simulador

| Flag           | Valor por defecto             | Uso                                         |
| -------------- | ----------------------------- | ------------------------------------------- |
| `--trajectory` | `circle`                      | `circle` o `square`.                        |
| `--rate`       | `30`                          | Frecuencia de poses en Hz.                  |
| `--duration`   | `0`                           | Segundos; `0` corre hasta `Ctrl+C`.         |
| `--drift`      | desactivado                   | Separa la pose cruda de la corregida.       |
| `--url`        | `wss://localhost:8443/ingest` | Destino del relay.                          |
| `--device`     | `sim-client`                  | Nombre enviado en el mensaje `hello`.       |
| `--insecure`   | desactivado                   | No verifica TLS; solo para pruebas locales. |
| `--log-level`  | `info`                        | `debug`, `info`, `warn`, `error`, `silent`. |

### Cliente AR (Fases 3 y 4)

`/ar.html` es el cliente real. Usa la pose de WebXR/ARCore y, si la sesión
habilita `camera-access`, captura la imagen con `getCameraImage`, la convierte a
gris y envía `hello` con los intrínsecos. Si `camera-access` no está disponible,
sigue funcionando solo con VIO y lo indica en el overlay.

1. Abrí `/ar.html` por HTTPS. La página comprueba `window.isSecureContext` y
   `navigator.xr.isSessionSupported('immersive-ar')`.
2. Esperá a que el pill **Relay** pase a **conectado**. Si no conecta, revisá la
   URL de `?ingest=` y la consola del servidor.
3. Presioná **Iniciar AR** y aceptá los permisos de Chrome/ARCore.
4. En el overlay verificá tracking, FPS, conexión, mensajes enviados y buffer.
5. Si `camera-access` está habilitado, verificá:
   - **Cámara: habilitada** y **Estado: capturando**;
   - **Imagen** con el tamaño procesado (por ejemplo `640×480`);
   - **Captura** cercana a 10 Hz;
   - **Intrínsecos** con valores plausibles y **Fuente: XRView** o
     **calibración**;
   - la vista previa en gris, con el mismo arriba/abajo que la escena real;
   - **hello** con al menos un envío.
6. En Foxglove Studio, con `ws://IP_DE_LA_PC:8765`, mirá `/pose/raw` en `odom`,
   `/pose/corrected` en `world` y el árbol `/tf`. La pose corregida usa
   `T_WORLD_ODOM_INITIAL` hasta que exista detección de marcadores.
7. Para pruebas controladas, la URL acepta:

   ```text
   /ar.html?hz=15&ingest=wss://192.168.1.18:8443/ingest
   /ar.html?camhz=5&camw=480&preview=0
   ```

   `hz` se limita a 1–60. `camhz` se limita a 1–30. `camw` es el lado mayor de
   la imagen procesada y se limita a 80–1920 px. `preview=0` apaga la vista
   previa para ahorrar CPU/GPU. La URL de `ingest` debe ser `ws://` o `wss://`.

El overlay muestra **0 marcadores** porque la detección AprilTag empieza en la
Fase 5; el contador se conectará al detector en esa fase.

### Calibración opcional de cámara

Sin archivo de calibración, los intrínsecos se derivan de
`XRView.projectionMatrix`. Para usar una calibración medida con tablero:

```powershell
Copy-Item config/camera_intrinsics.example.json config/camera_intrinsics.json
# editar image_size e intrinsics con los valores de OpenCV
pnpm dev
```

El archivo no se versiona y se sirve en `/config/camera_intrinsics.json`. El
esquema exige `image_size` e `intrinsics` y acepta `reprojection_error_px` y
`note` opcionales. Los valores se escalan a la imagen procesada sin reflejar
`cy`, porque OpenCV ya usa origen arriba a la izquierda. Si el archivo está
presente pero es inválido, el servidor responde 503 y el cliente registra el
error y vuelve a los intrínsecos derivados.

El servidor Foxglove usa `ws://` sin TLS porque queda en la red local. La
telemetría del celular sí viaja por `wss://` al puerto 8443.

Si Foxglove no muestra los tópicos, revisá en `/health` el campo
`foxglove.subscribed_topics` y la consola del servidor. Para diagnosticar el
relay, ejecutá el simulador con `--log-level debug` y mirá los mensajes
`[server:ingest]`.

## 7. Verificación manual en el celular (Fases 0, 3 y 4)

Esta es la parte que cierra los criterios de aceptación de la Fase 0, la Fase 3
y la Fase 4. Anotá el resultado en `docs/results.md` o adjuntá el reporte copiado
desde la página.

1. Confirmá que el celular y la PC están en la misma red y que la PC responde
   en `ping IP_DE_LA_PC`.
2. Abrí `https://IP_DE_LA_PC:5173/` en Chrome Android.
3. Verificá que el candado sea válido y que **no** aparezca
   `ERR_CERT_AUTHORITY_INVALID` ni una pantalla de "La conexión no es privada".
4. En la página de inicio, comprobá que el estado del servidor sea OK.
5. Entrá a **Abrir cliente AR** (`/ar.html`) y esperá que el pill **Relay**
   indique **conectado**.
6. Presioná **Iniciar AR** y aceptá los permisos que pida Chrome o ARCore.
7. Confirmá en el overlay:
   - tracking distinto de `lost` mientras el celular está quieto;
   - FPS estable y cercano a la tasa de frames del dispositivo;
   - conexión en **conectado**, mensajes enviados crecientes y buffer en 0;
   - el contador de marcadores queda en 0: la detección llega en la Fase 5.
8. Si `camera-access` está disponible, confirmá:
   - **Cámara: habilitada**, **Estado: capturando** e **Imagen** con tamaño
     procesado;
   - **Captura** ≥ 10 Hz (o el valor configurado con `camhz`);
   - la vista previa en gris coincide con la escena y no está invertida;
   - **Intrínsecos** estables y **Fuente** correcta;
   - **hello** con al menos un envío;
   - en `/health`, `byType.hello` mayor que 0 y el dispositivo en
     `ingest.devices`.
9. Abrí Foxglove Studio en `ws://IP_DE_LA_PC:8765` y suscribite a `/pose/raw`,
   `/pose/corrected`, `/tf`, `/markers` y `/metrics`.
10. Caminá unos metros, girate y agachate/saltá. En Foxglove:
    - el marco de la cámara debe moverse de forma fluida y consistente;
    - avanzar hacia adelante debe mover el marco en la dirección esperada de
      `world` (el eje `+x` al inicio);
    - los giros y el movimiento vertical deben corresponder al movimiento real;
    - `/pose/raw` debe estar en `odom` y `/pose/corrected` en `world`.
11. Entrá a **Diagnóstico WebXR** (`/ar-test.html`) para comprobar
    `camera-access`, reference spaces y la textura de cámara. Copiá el reporte
    como evidencia.

### Qué significa cada resultado

- **Sesión AR inicia y tracking OK:** se cumple el criterio de la Fase 0.
- **La pose de `/ar.html` llega y se mueve con fluidez, con ejes correctos:** se
  cumple el criterio de la Fase 3.
- **La imagen en gris se ve a ≥10 Hz con orientación correcta y `hello` llega
  con intrínsecos:** se cumple el criterio de la Fase 4.
- **La pose llega pero los ejes no coinciden:** no aceptar la Fase 3; revisar
  `docs/conventions.md`, la conversión `poseFromWebXRMatrix` y la orientación
  inicial `T_WORLD_ODOM_INITIAL` antes de avanzar.
- **La imagen se ve invertida o girada:** no aceptar la Fase 4; revisar la
  inversión de `v` en `camera-capture.ts`, el origen top-left de `cy` y la
  orientación real del sensor. Anotar el modelo de celular y una captura.
- **`camera-access` no está disponible:** la Fase 3 no se ve afectada porque
  solo usa la pose, pero la Fase 4 queda bloqueada. Anotarlo como riesgo.
- **No inicia o no hay pose:** revisar la sección 8 y no avanzar a la Fase 5
  hasta resolverlo.
- **Certificado inválido:** no seguir; WebXR no funciona de forma confiable sin
  un contexto seguro válido.

## 8. Solución de problemas

### El servidor no arranca: faltan certificados

Mensaje típico:

```text
[server] Faltan los certificados TLS
```

Ejecutá `pnpm cert:setup` en una consola elevada. Para una prueba rápida de
escritorio, usá el modo `--http` de la sección 4.

### `mkcert` no se reconoce

Cerrá y reabrí la terminal después de `winget install`. Verificá con
`mkcert -version`. Si sigue faltando, revisá que
`%LOCALAPPDATA%\Microsoft\WinGet\Links` esté en el `PATH`.

### Chrome Android muestra `ERR_CERT_AUTHORITY_INVALID`

- La CA no está instalada o se instaló como certificado de usuario normal en
  lugar de CA.
- Se generó una CA nueva con otro `mkcert -CAROOT`; reinstalá `rootCA.pem`.
- La URL usa una IP distinta de la que está en el certificado; volvé a ejecutar
  `pnpm cert:setup`.
- Chrome conserva una conexión vieja: cerralo por completo y reabrilo.

### `ERR_CERT_COMMON_NAME_INVALID`

La IP o el nombre usado no está en el certificado. Revisá la salida del script
y regenerá con la IP correcta.

### `ERR_CONNECTION_REFUSED` o `ERR_CONNECTION_TIMED_OUT`

- El servidor no está corriendo o el puerto está ocupado.
- La PC y el celular no están en la misma red.
- El firewall bloquea el puerto o la red está en perfil Público.
- La red WiFi tiene aislamiento de clientes.

Probá primero desde la PC:

```powershell
curl.exe -k https://IP_DE_LA_PC:8443/health
```

Si funciona en la PC y no en el celular, el problema es de red/firewall.

### La página abre pero no hay `navigator.xr`

- No es un contexto seguro (revisá el candado y `window.isSecureContext`).
- El navegador no es Chrome Android o está desactualizado.
- El dispositivo no es compatible con ARCore.

### `immersive-ar` no está soportado

- Verificá que Google Play Services for AR esté instalado y actualizado.
- Comprobá el modelo contra la lista oficial de dispositivos ARCore.
- Cerrá otras apps que estén usando la cámara.
- El emulador de Android Studio no sirve: no implementa WebXR.

### `camera-access` no aparece o falla

`camera-access` es una feature opcional. Si no está disponible, la sesión AR
puede iniciar igual, pero no habrá imagen para detectar marcadores. Anotá el
modelo, la versión de Chrome y el contenido de `enabledFeatures`. Es un riesgo
de la Fase 4, no algo que se resuelva con un test unitario.

### El overlay dice "esperando imagen…" o "error de captura"

- **Estado: esperando imagen…** significa que la sesión habilitó
  `camera-access` pero ningún `XRView` expone `view.camera`. El cliente sigue
  solo con VIO y registra un aviso después de 120 frames.
- **Estado: error de captura** indica que `getCameraImage` devolvió `null`, la
  textura no era válida o `readPixels` falló. Revisá la consola de Chrome; el
  log incluye el error WebGL.
- Si `XRWebGLBinding` no existe, `/ar.html` degrada a solo VIO y lo informa en
  el overlay.
- Cerrá otras apps que usen la cámara y reiniciá la sesión AR.

### La vista previa se ve invertida o girada

La textura de cámara de WebXR tiene origen abajo a la izquierda. El shader
invierte `v` para producir una imagen top-left. Si la vista previa no coincide
con la escena, revisá `packages/client/src/camera-capture.ts` y anotá el modelo
de celular y la orientación del dispositivo (vertical/horizontal). No aceptes
la Fase 4 hasta corregirlo.

### Los intrínsecos no son plausibles

- Confirmá que `image_size` del `hello` coincide con la imagen procesada
  (`640×480`, `640×360`, etc.), no con la textura original.
- Revisá que la calibración opcional esté definida para su propia
  `image_size`; el cliente la escala.
- Si usás `config/camera_intrinsics.json`, verificá que el endpoint responda
  200 y que `/health` muestre `camera_intrinsics.available: true`.
- Los valores derivados dependen de `XRView.projectionMatrix`; una calibración
  con tablero es la alternativa si el error de PnP es alto.

### `adb reverse` como plan B

Con depuración USB activa y `adb` en el `PATH`:

```powershell
adb reverse tcp:5173 tcp:5173
adb reverse tcp:8443 tcp:8443
```

Después abrí en el celular:

```text
https://localhost:5173/
```

El certificado incluye `localhost`. Esto evita depender de la red WiFi, aunque
el tráfico sigue pasando por el cable USB.

### El cliente AR no conecta al relay

- Verificá que el servidor esté corriendo y que `/health` responda.
- Revisá el pill **Relay** en `/ar.html`: `reconectando…` indica que el
  WebSocket se cerró; el cliente reintenta con backoff automáticamente.
- Si usaste `?ingest=`, comprobá que sea una URL `ws://` o `wss://` y que el
  puerto sea el correcto.
- Con Vite, el proxy `/ingest` reenvía a `https://127.0.0.1:8443`; el servidor
  Node tiene que estar levantado.
- En el celular, el certificado tiene que ser válido también para el WebSocket
  seguro. Si la página abre con advertencia, `wss://` no funcionará.

### Ver la consola del celular

1. Conectá el celular por USB y habilitá la depuración USB.
2. Abrí `chrome://inspect` en Chrome de la PC.
3. Inspeccioná la pestaña del celular.
4. Revisá errores de certificado, permisos y WebXR en la consola.

## 9. Checklist de Fase 0

- [x] `pnpm install` sin errores.
- [x] `pnpm cert:setup` ejecutado y certificados generados con mkcert.
- [ ] Reglas de firewall para 5173, 8443 y 8765 creadas en PowerShell elevado.
- [ ] CA instalada en Android como CA de usuario.
- [ ] `https://IP_DE_LA_PC:5173/` abre sin advertencia.
- [x] `/health` responde por HTTPS con `tls: true` y certificado válido.
- [ ] `/ar-test.html` inicia una sesión `immersive-ar`.
- [ ] La sesión entrega tracking y FPS.
- [ ] Se conoce el estado de `camera-access`.
- [ ] Reporte de la prueba guardado en `docs/results.md`.

La Fase 0 queda cerrada cuando todos los ítems anteriores tienen un resultado
explícito. La Fase 1 (matemática y convenciones) ya está cubierta por tests
automáticos; ver `docs/results.md`.

### Checklist de Fase 2

- [x] `pnpm test` pasa los 13 tests de la Fase 2 (16 actuales del servidor).
- [x] `/health` muestra los bloques `ingest` y `foxglove`.
- [x] `pnpm sim` envía poses y `messagesValid` aumenta.
- [x] Foxglove Studio se conecta a `ws://IP_DE_LA_PC:8765`.
- [x] Se ven los cinco tópicos y el árbol `world → odom → camera`.
- [x] Se ven los seis marcadores y las dos trayectorias.
- [x] `/metrics` muestra tracking, FPS y latencia de procesamiento.
- [x] La prueba se registra en `docs/results.md`.

La Fase 2 quedó cerrada el **2026-11-05** con Foxglove Studio **3.5.0**. El
relay con HTTPS real y mkcert se verificó el **2026-11-06** con el simulador.
Queda pendiente la telemetría del celular y repetir el relay por la IP LAN. La
validación móvil de la Fase 0 sigue pendiente y se retoma cuando haya un celular
ARCore disponible.

### Checklist de Fase 3

- [x] `/ar.html` compila en el build multipágina y se sirve por HTTPS.
- [x] `pnpm test` pasa los 7 tests originales del cliente.
- [x] El relay acepta un mensaje `pose` crudo sin `hello` (1 válido, 0 inválidos).
- [x] El cliente reconecta, bufferiza y descarta mensajes viejos (tests).
- [ ] `/ar.html` inicia una sesión `immersive-ar` en el celular.
- [ ] El overlay muestra tracking, FPS, conexión y mensajes enviados.
- [ ] La pose cruda llega a `/health` y a Foxglove (`/pose/raw`, `/tf`).
- [ ] La pose se mueve con fluidez y a una frecuencia cercana a 30 Hz.
- [ ] Avanzar, girar y cambiar de altura producen el movimiento esperado en
      `world`.
- [ ] La prueba se registra en `docs/results.md`.

La Fase 3 está implementada en código y cubierta por tests de transporte, pero
el criterio de aceptación depende de la prueba en el celular. No se declara
cerrada hasta completar los ítems pendientes.

### Checklist de Fase 4

- [x] La captura compila y se incluye en el build multipágina.
- [x] `pnpm test` pasa los 85 tests (44 shared + 25 client + 16 server).
- [x] El endpoint `/config/camera_intrinsics.json` responde 404 sin archivo.
- [x] Con una calibración válida responde 200 y `/health` marca
      `camera_intrinsics.available: true`.
- [x] Los tests cubren tamaño de captura, derivación de intrínsecos, escalado,
      calibración, etiqueta del dispositivo y `hello` tras reconexión.
- [ ] `camera-access` se habilita en el celular y `getCameraImage` devuelve una
      textura.
- [ ] La vista previa en gris se ve a ≥10 Hz y con orientación correcta.
- [ ] Los intrínsecos del overlay son estables y corresponden a la imagen
      procesada.
- [ ] El servidor recibe `hello` (`byType.hello > 0`) con el dispositivo y
      `image_size` correctos.
- [ ] Con una calibración propia, el cliente usa `Fuente: calibración` y los
      valores escalados.
- [ ] La prueba se registra en `docs/results.md`.

La Fase 4 está implementada en código y verificada en la PC hasta el endpoint y
los tests. El criterio de aceptación —imagen gris visible a ≥10 Hz con
orientación correcta— requiere un celular con `camera-access`. No se declara
cerrada hasta completar los ítems pendientes.

### Checklist de Fase 5 en adelante

No iniciar la Fase 5 hasta aceptar la Fase 4 en un celular real. La detección
AprilTag necesita la textura, los intrínsecos y la orientación de la imagen ya
validados.
