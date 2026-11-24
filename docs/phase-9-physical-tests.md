# Fase 9 — Guía de pruebas físicas

## 1. Objetivo

Validar el funcionamiento del sistema VIO en un entorno físico utilizando un celular Android compatible con ARCore y marcadores AprilTag.

Se busca comparar tres configuraciones:

VIO sin corrección (off): utiliza la estimación visual-inercial sin aplicar correcciones del mapa.

Corrección directa (direct o A): aplica inmediatamente las correcciones obtenidas a partir de los marcadores.

Corrección suavizada (smooth o B): aplica las correcciones gradualmente mediante interpolación.

El objetivo es observar las diferencias entre las estrategias y registrar sus resultados. Las pruebas deben realizarse en las mismas condiciones para que la comparación sea válida.

## 2. Requisitos previos

Antes de comenzar, verificar:

Celular Android compatible con ARCore.

Google Play Services for AR instalado y actualizado.

Google Chrome actualizado.

Computadora con el proyecto TP-Integrador-VIO.

Celular y computadora conectados a la misma red Wi-Fi.

Certificado HTTPS y autoridad certificante configurados y confiables en el celular.

Marcadores AprilTag impresos e instalados en el espacio de prueba.

Mapa de marcadores configurado con las posiciones y orientaciones reales del espacio.

Importante sobre el mapa: el archivo de demostración representa una sala sintética de 4 × 3 × 2,5 metros. No debe utilizarse como si describiera la sala real. Antes de las pruebas, comprobar que las posiciones, orientaciones e IDs del mapa coincidan con los marcadores instalados.

## 3. Preparación del entorno

### 3.1. Obtener la dirección IP de la computadora

En PowerShell:

ipconfig

Buscar la dirección IPv4 del adaptador Wi-Fi. Por ejemplo:

192.168.1.18

En los siguientes pasos, reemplazar IP_PC por esa dirección.

### 3.2. Iniciar el proyecto

Desde la raíz del repositorio:

pnpm dev

Dejar la terminal abierta mientras se realizan las pruebas.

El proyecto debe estar accesible desde el celular mediante HTTPS. Según la configuración documentada, el cliente utiliza el puerto 5173 y el servidor el puerto 8443.

Si el proyecto no puede iniciarse o el celular no puede acceder, revisar docs/setup.md antes de continuar.

### 3.3. Verificar la conexión

Desde el navegador del celular, acceder a:

https://IP_PC:5173/ar-test.html

Comprobar que las capacidades necesarias para la sesión AR estén disponibles, especialmente immersive-ar y camera-access.

Luego acceder a la aplicación:

https://IP_PC:5173/ar.html

Si no se inicia una sesión AR o no se detecta la cámara, no continuar con las pruebas de corrección. Registrar el problema.

### 3.4. Comprobar el servidor

Desde la computadora, verificar:

https://localhost:8443/health

Comprobar que el servidor esté activo y que cargue el mapa de marcadores esperado.

## 4. Selección de las estrategias

La estrategia se selecciona mediante el parámetro mode de la URL.

| Estrategia     | Parámetro     | Comportamiento                              |
| :------------- | :------------ | :------------------------------------------ |
| Sin corrección | `mode=off`    | No aplica correcciones del mapa.            |
| Directa (A)    | `mode=direct` | Aplica la corrección inmediatamente.        |
| Suavizada (B)  | `mode=smooth` | Interpola gradualmente hacia la corrección. |

También se aceptan los valores a y b para las estrategias directa y suavizada.

Ejemplos de URLs:

VIO sin corrección:

https://IP_PC:5173/ar.html?mode=off&ingest=wss://IP_PC:8443/ingest

Corrección directa (A):

https://IP_PC:5173/ar.html?mode=direct&ingest=wss://IP_PC:8443/ingest

Corrección suavizada (B):

https://IP_PC:5173/ar.html?mode=smooth&ingest=wss://IP_PC:8443/ingest

Reemplazar IP_PC por la dirección IPv4 real de la computadora.

Para cada cambio de estrategia, abrir la URL correspondiente y comprobar que la aplicación haya cargado correctamente.

Consideración técnica: la primera observación válida de un marcador inicializa la localización tanto en A como en B. La diferencia entre ambas estrategias se observa en las correcciones posteriores.

## 5. Protocolo de experimentación

Mantener el mismo recorrido, punto inicial, punto final y condiciones ambientales al comparar las tres estrategias.

Antes de cada ejecución:

Abrir la URL correspondiente a la estrategia.

Iniciar una sesión AR.

Comprobar que el seguimiento esté activo.

Ubicarse en el punto inicial establecido.

Esperar a que el sistema esté estable.

Realizar el recorrido definido.

Volver al punto inicial.

Registrar los resultados y cualquier incidencia.

#### Experimento 1 — VIO sin corrección

Configuración:

mode=off

Realizar un recorrido cerrado por la sala, regresando al punto inicial.

Objetivo: observar la deriva acumulada sin correcciones de los marcadores.

Repeticiones: 3 ejecuciones como mínimo.

Experimento 2 — Corrección directa (A)

Configuración:

mode=direct

Repetir exactamente el recorrido anterior.

Objetivo: observar cómo responde la localización cuando las correcciones del mapa se aplican inmediatamente.

Repeticiones: 3 ejecuciones como mínimo.

Experimento 3 — Corrección suavizada (B)

Configuración:

mode=smooth

Repetir el mismo recorrido.

Objetivo: observar si las correcciones graduales reducen los saltos bruscos de posición y orientación.

Repeticiones: 3 ejecuciones como mínimo.

Experimento 4 — Variación de condiciones

Evaluar el comportamiento del sistema modificando las condiciones de observación:

Distancia al marcador.

Ángulo de observación.

Iluminación.

Oclusión parcial del marcador.

Registrar cada condición evaluada y realizar al menos tres repeticiones por condición.

No cambiar varias condiciones simultáneamente si se busca identificar cuál afecta el resultado.

## 6. Datos que deben registrarse

Completar una ficha por cada ejecución.

| Dato                 | Qué registrar                                                 |
| :------------------- | :------------------------------------------------------------ |
| Identificador        | Número de ejecución.                                          |
| Fecha y hora         | Momento de la prueba.                                         |
| Estrategia           | `off`, `direct` o `smooth`.                                   |
| Dispositivo          | Modelo del celular.                                           |
| Recorrido            | Descripción del recorrido realizado.                          |
| Iluminación          | Buena, media o baja.                                          |
| Distancia            | Distancia aproximada al marcador.                             |
| Ángulo               | Frontal u oblicuo; indicar el ángulo aproximado si se conoce. |
| Oclusión             | Sin oclusión o porcentaje aproximado.                         |
| Seguimiento          | Si se mantuvo activo o se perdió.                             |
| Marcadores           | IDs detectados y observaciones.                               |
| Rendimiento          | FPS y latencia disponibles.                                   |
| Cierre del recorrido | Diferencia observada respecto del punto inicial.              |
| Incidencias          | Errores, saltos, demoras o comportamientos inesperados.       |

Cuando sea posible, medir físicamente la diferencia entre la posición final y la inicial. Registrar el valor en centímetros.

No estimar mediciones que no se hayan realizado.

## 7. Registro de ejecuciones

Para conservar los mensajes en JSONL, iniciar el servidor con `--record`:

```powershell
pnpm start -- --record
```

Los archivos generados deben conservarse junto con sus manifiestos. No sobrescribir ni eliminar ejecuciones anteriores.

Para cada archivo, anotar qué estrategia y qué recorrido representa. El grabador no informa automáticamente la estrategia utilizada: esa información debe registrarse en esta ficha.

Los registros permiten analizar mensajes, tiempos y poses recibidas, pero no reemplazan las mediciones físicas de referencia. La comparación de error de cierre y posición real requiere mediciones externas.

Al terminar cada recorrido, cerrar el servidor de forma controlada y ejecutar:

```powershell
pnpm analyze -- data/runs/<corrida>.jsonl
```

Conservar `metrics.json`, `trajectory.csv` y `checkpoints.csv` junto con la
ficha del experimento. El error de cierre calculado por el analizador mide la
diferencia entre la primera y la última pose estimada; no reemplaza la medición
física en centímetros.

## 8. Tabla de resultados

Completar una tabla por estrategia:

| Estrategia   | Repetición | Error de cierre |  FPS  | Latencia  | Observaciones                       |
| :----------- | :--------: | :-------------: | :---: | :-------: | :---------------------------------- |
| `off`        |     1      |    26,96 cm     | 26,57 | ≈1026 ms* | cierre crudo; tracking 100 %        |
| `off`        |     2      |     2,53 cm     | 27,35 | ≈1033 ms* | cierre crudo; tracking 100 %        |
| `off`        |     3      |     5,83 cm     | 25,74 | ≈1035 ms* | cierre crudo; tracking 100 %        |
| `direct` (A) |     1      |     7,87 cm     | 26,45 | ≈1037 ms* | cierre corregido estable; 177 corr. |
| `direct` (A) |     2      |     2,83 cm     | 26,55 | ≈1041 ms* | cierre corregido estable; 168 corr. |
| `direct` (A) |     3      |     4,49 cm     | 27,31 | ≈1045 ms* | cierre corregido estable; 171 corr. |
| `smooth` (B) |     1      |     5,88 cm     | 27,69 | ≈1048 ms* | cierre corregido estable; 271 corr. |
| `smooth` (B) |     2      |     1,99 cm     | 28,91 | ≈1038 ms* | cierre corregido estable; 336 corr. |
| `smooth` (B) |     3      |     4,71 cm     | 27,52 | ≈1052 ms* | cierre corregido estable; 221 corr. |

Las unidades deben indicarse: error de cierre en centímetros, FPS en cuadros por segundo y latencia en milisegundos.

\* La latencia contiene un offset casi constante entre los relojes del cliente y
el servidor; no representa latencia de red aislada.

### Condiciones variables registradas

| Condición                 | Repeticiones | Resultado                                        |
| ------------------------- | :----------: | ------------------------------------------------ |
| Distancia 1,20 m          |      3       | PnP 1,09–1,11 m; tracking 100 %                  |
| Ángulo oblicuo ≈45°       |      3       | PnP 0,82–0,83 m; tracking 100 %                  |
| Iluminación ambiente baja |      3       | PnP 0,61 m; tracking 100 %                       |
| Oclusión parcial ≈25 %    |      3       | 0 detecciones/correcciones; tracking WebXR 100 % |

## 9. Criterios de aceptación

La fase podrá considerarse validada físicamente cuando:

Se hayan realizado al menos tres ejecuciones de cada estrategia.

Se haya comprobado el funcionamiento de la detección de marcadores.

Se haya verificado que las correcciones A y B se comportan según lo esperado.

Se hayan registrado las condiciones variables de distancia, ángulo, iluminación y oclusión.

Se disponga de mediciones que permitan comparar el error de cierre entre estrategias.

Se hayan documentado los problemas y limitaciones encontrados.

No se exige que una estrategia sea necesariamente superior en todos los escenarios: se deben presentar los resultados obtenidos y explicar las diferencias observadas.

## 10. Informe para completar la Fase 10

Al finalizar las pruebas, entregar:

Las fichas de todas las ejecuciones.

Los archivos JSONL y manifiestos disponibles.

Las mediciones de error de cierre.

Fotografías del espacio y de los marcadores instalados, si es posible.

Capturas de la aplicación y de Foxglove.

Una breve conclusión comparando off, direct y smooth.

Los problemas detectados y las limitaciones del sistema.

Los resultados reales deberán incorporarse posteriormente a docs/results.md.

## 11. Limitaciones y aclaraciones

Las pruebas realizadas con el simulador de escritorio no sustituyen las pruebas con ARCore y cámara real.

La detección de AprilTags requiere acceso a la imagen de la cámara.

El mapa debe representar el espacio físico real.

La disponibilidad de camera-access depende del dispositivo y del navegador.

Los valores de FPS y latencia deben interpretarse según los datos efectivamente registrados.

No se deben completar tablas con resultados supuestos o generados artificialmente.

Estado de la Fase 9: **validada en un montaje físico controlado de un marcador**
con POCO X7 Pro. Se completaron tres recorridos por estrategia y tres
repeticiones por condición. La generalización a una sala multimarcador continúa
como limitación documentada, no como resultado supuesto.

Los resultados se incorporaron a `docs/final-report.md` para la Fase 10.
