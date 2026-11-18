# Layouts de Foxglove Studio (Fase 7)

Este directorio contiene la configuración exportada del layout de **Foxglove Studio** para la visualización 3D y telemetría del proyecto VIO con marcadores fiduciarios.

## Contenido del directorio

- `layout.json`: Archivo de configuración del layout exportado desde Foxglove Studio.
- Contiene los paneles preconfigurados para:
  1. **Visualización 3D**: Marco de referencia `world`, transformaciones `/tf`, marcadores y trayectoria cruda/corregida `/markers`.
  2. **Gráficos de métricas**: Corrección de posición (`delta_p_m`), corrección angular (`delta_angle_rad`) y cuadros por segundo (`fps`).
  3. **Mensajes crudos**: Inspección del canal `/metrics`.

## Cómo usar este layout

Para cargar este layout en una instalación limpia de Foxglove Studio:

1. Iniciar el servidor local (`pnpm dev` o `pnpm start`) y opcionalmente el simulador (`pnpm sim`).
2. Abrir **Foxglove Studio** de escritorio.
3. Crear o seleccionar una conexión de tipo **Foxglove WebSocket** hacia `ws://localhost:8765`.
4. Ir al menú superior -> **Layout** -> **Import from file...** (o Ctrl+O / Cmd+O).
5. Seleccionar el archivo `foxglove/layout.json`.
6. La vista se actualizará mostrando el mapa de marcadores en 3D, las trayectorias y los paneles de telemetría sin requerir configuración manual.

Para más detalles sobre la configuración paso a paso, consultar `docs/foxglove.md`.
