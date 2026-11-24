# Guion breve para video/demo final

Duración sugerida: **2 a 3 minutos**. Grabar en horizontal si se mostrará la PC
y en vertical si se prioriza el overlay del celular.

## Preparación

- Servidor HTTPS y Foxglove iniciados.
- Celular y PC en la misma red.
- AprilTag ID 0 visible y completo.
- Overlay con `Detector: listo`, `Mapa: cargado` y conexión activa.
- Evitar mostrar certificados, claves, datos personales o notificaciones.

## Secuencia

### 1. Objetivo — 15 segundos

Mostrar la pantalla inicial y decir:

> Esta aplicación web usa WebXR y ARCore para obtener la pose del celular,
> detecta AprilTags en la cámara, corrige la deriva con un mapa conocido y
> publica la trayectoria en Foxglove.

### 2. Pose y cámara — 25 segundos

Iniciar AR en modo `Off`. Mostrar tracking, FPS, conexión, imagen gris e
intrínsecos. Mover el celular suavemente hacia adelante, hacia un costado y en
altura.

### 3. Detección y PnP — 25 segundos

Apuntar al AprilTag. Mostrar el contador de marcadores, el contorno detectado y
el error de reproyección. Mencionar que a 60 cm el error métrico medido fue
−6,23 %.

### 4. Corrección — 35 segundos

Cambiar a `Directo (A)` y mostrar que aumentan las correcciones aceptadas.
Cambiar a `Suavizado (B)` y explicar que reduce la magnitud de cada salto. Por
último seleccionar `Off` y mostrar que continúan las detecciones, pero no se
generan correcciones.

### 5. Foxglove — 30 segundos

Mostrar los cinco tópicos, las trayectorias cruda y corregida, los TF y las
métricas. Señalar el marcador del mapa y la pose del celular.

### 6. Resultados — 30 segundos

Mostrar los dos gráficos del informe final y resumir:

- tracking 100 % en las pruebas;
- pose absoluta con 5,8 cm de error 3D;
- PnP dentro de ±10 % a distancia conocida;
- oclusión del 25 % bloqueó el marcador, pero WebXR continuó funcionando.

### 7. Cierre — 10 segundos

> El flujo completo funciona en Chrome Android. Las principales limitaciones
> son el uso de un solo dispositivo y un mapa controlado de un marcador; una
> instalación multimarcardor permitirá evaluar una sala completa.

## Checklist de entrega

- [ ] Audio comprensible y sin notificaciones visibles.
- [ ] Se observa el overlay móvil con tracking y conexión.
- [ ] Se ve al menos una detección real del ID 0.
- [ ] Se muestran Directo, Suavizado y Off.
- [ ] Foxglove muestra pose, TF, marcadores y métricas.
- [ ] Se muestran resultados reales y limitaciones, sin afirmar métricas no medidas.
