# Guía de Visualización y Layout en Foxglove Studio

Esta guía documenta los pasos para configurar, probar y exportar el layout de visualización en **Foxglove Studio** para el proyecto VIO con marcadores fiduciarios (Fase 7).

---

## 1. Requisitos Previos

- Tener instalado **Foxglove Studio** (aplicación de escritorio).
- Tener corriendo el servidor VIO:
  ```bash
  pnpm dev
  ```
  _(o `pnpm start` en producción)_.
- Opcionalmente, para probar sin celular, ejecutar el simulador de trayectoria:
  ```bash
  pnpm sim
  ```

---

## 2. Conexión desde Foxglove Studio

1. Abrir **Foxglove Studio**.
2. Hacer clic en **Open connection**.
3. Seleccionar el origen **Foxglove WebSocket**.
4. Ingresar la URL del servidor: `ws://localhost:8765` (o `ws://<IP_PC>:8765` si estás en otra máquina en la misma red).
5. Hacer clic en **Open**.

---

## 3. Estructura del Layout Recomendado

El layout recomendado consta de 4 paneles clave organizados para una visión completa del estado de localización:

### 3.1. Panel 3D (`3D Panel`)

- **Frame global (`Frame`)**: Configurar en `world`.
- **Transforms (`/tf`)**: Habilitado para visualizar las relaciones entre `world`, `odom`, `camera` y cada `marker_<id>`.
- **Scene Updates (`/markers`)**: Habilitado. Muestra:
  - Cubos azules con etiquetas `ID <n>` representando la posición conocida de los marcadores.
  - Línea roja (`trajectory_raw` en frame `odom` / `world` inicial).
  - Línea verde (`trajectory_corrected` en frame `world`).

### 3.2. Panel Plot (Gráficos)

- Agregar un panel de tipo **Plot**.
- Configurar las siguientes series temporal:
  - `/metrics.last_correction.delta_p_m` (Magnitud de corrección de posición en metros).
  - `/metrics.last_correction.delta_angle_rad` (Magnitud de corrección angular en radianes).
  - `/metrics.fps` (Tasa de imágenes/poses procesadas por segundo).

### 3.3. Panel Raw Messages (Mensajes en vivo)

- Agregar un panel de tipo **Raw Messages**.
- Suscribir al tópico `/metrics`.
- Muestra el objeto JSON en tiempo real con:
  - `tracking` (`tracking` | `limited` | `lost`)
  - `visible_markers` (IDs de marcadores detectados actualmente)
  - `processing_latency_ms` (Latencia de procesamiento en el servidor)

### 3.4. Panel Indicator / State (Estado del Tracking)

- Opcional: Agregar un panel de tipo **State / Gauge** o **Text** enlazado a `/metrics.tracking` para verificar rápidamente la estabilidad del VIO.

### 3.5. Guía Paso a Paso para Armar un Layout Desde Cero en Foxglove Studio

1. **Crear una disposición limpia**:
   - En Foxglove Studio, abre una pestaña nueva o borra el layout actual (**Layout** -> **Clear layout**).
2. **Agregar el Panel 3D**:
   - Haz clic en el botón `+ Add panel` (esquina superior izquierda o en el centro del panel vacío).
   - Selecciona **3D**.
   - En la barra lateral de configuración del panel 3D:
     - En **Frame** (marco global), selecciona `world`.
     - En la sección **Topics**, asegúrate de habilitar `/tf` y `/markers`.
3. **Dividir la pantalla y agregar el Panel Plot**:
   - Pasa el cursor por el panel 3D y haz clic en el icono de **Split right** (dividir a la derecha) o arrastra desde la esquina.
   - En la mitad derecha vacía, selecciona **Plot**.
   - En la configuración del Plot (derecha), haz clic en `+ Add path` para añadir las siguientes variables:
     - `/metrics.last_correction.delta_p_m`
     - `/metrics.last_correction.delta_angle_rad`
     - `/metrics.fps`
4. **Dividir el espacio derecho y agregar Raw Messages**:
   - En el panel Plot recién creado, haz clic en el icono de **Split down** (dividir abajo).
   - En la mitad inferior derecha, selecciona el panel **Raw Messages**.
   - En la barra del panel, ingresa el tópico `/metrics`.
5. **Ajustar proporciones y guardar**:
   - Arrastra los divisores entre paneles para ajustar los tamaños (proporción sugerida: 65% panel 3D a la izquierda, 35% columna de métricas a la derecha).
   - Para guardar tu layout y compartirlo, dirígete a **Layout** -> **Export layout to file...** y guardalo como `foxglove/layout.json`.

---

## 4. Exportar el Layout a `foxglove/layout.json`

Una vez armados y organizados los paneles en Foxglove Studio:

1. Ir al menú de la aplicación (o panel superior de Layout).
2. Hacer clic en **Layout** -> **Export layout to file...**
3. Guardar el archivo directamente en la carpeta del proyecto:
   `foxglove/layout.json`
4. Confirmar que el archivo ha sido guardado y hacer el commit correspondiente en Git.

---

## 5. Importar y Validar el Layout

Para verificar la aceptación de la Fase 7 en una instalación limpia:

1. Abrir Foxglove Studio y conectarse a `ws://localhost:8765`.
2. Ir a **Layout** -> **Import layout from file...** (o presionar `Ctrl+O` / `Cmd+O`).
3. Seleccionar `foxglove/layout.json`.
4. **Criterio de Aceptación**: Todos los paneles se abren y cargan automáticamente mostrando la escena 3D en marco `world`, los gráficos y las métricas sin requerir ajustes manuales.
