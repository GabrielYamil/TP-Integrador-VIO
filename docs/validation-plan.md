# Plan de validación restante

Última actualización: **2026-11-23**.

Este documento separa lo que ya está demostrado de lo que todavía necesita una
prueba manual, un marcador físico o trabajo de implementación. La evidencia
detallada está en [`results.md`](results.md) y en [`evidence/`](evidence/).

## Estado por fase

| Fase                          | Estado local                               | Evidencia disponible                                                                       | Falta para cerrarla                                                                      |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 0 — entorno y HTTPS           | **Completada**                             | CA instalada en POCO X7 Pro, HTTPS LAN válido, `immersive-ar`, `local-floor` y sesión real | Nada del criterio principal                                                              |
| 1 — matemática y convenciones | **Completada**                             | 44 tests automáticos                                                                       | Nada                                                                                     |
| 2 — relay y Foxglove          | **Completada**                             | Simulador y telemetría real del POCO; cinco tópicos visibles                               | Conservar una captura final para el informe                                              |
| 3 — pose cruda WebXR          | **Completada en POCO X7 Pro**              | Pruebas dirigidas de avance, izquierda, altura y yaw; tracking 100 % y 0 inválidos         | Nada del criterio principal                                                              |
| 4 — cámara e intrínsecos      | **Completada para el dispositivo probado** | `camera-access`, textura 864×1920, gris 288×640 a 10,2 Hz, intrínsecos estables y `hello`  | Calibración propia es opcional; solo hace falta si PnP no alcanza la precisión requerida |
| 5 — AprilTag y PnP            | **Validación móvil parcial**               | 882 detecciones ID 0 en pantalla; error medio 0,33 px y máximo 2,09 px                     | Medir el tamaño físico del tag y validar distancia/ejes a una separación conocida        |
| 6 — corrección                | **Implementada, no validada físicamente**  | Tests del corrector                                                                        | Probar modos directo y suavizado con un marcador conocido y observar la relocalización   |
| 7 — Foxglove                  | **Completada**                             | Layout importado y validado en Foxglove Studio 3.6.0; cinco tópicos y telemetría real      | Guardar una captura final para el informe                                                |
| 8 — registro y evaluación     | **Parcial avanzada**                       | Grabador JSONL, analizador con 5 tests y exportación JSON/CSV                              | Grabar y analizar una corrida real; incorporar tabla y gráficos al informe               |
| 9 — pruebas de sala           | **Pendiente**                              | Mapa demo sintético                                                                        | Medir una sala, instalar marcadores y repetir cada condición al menos 3 veces            |
| 10 — entrega                  | **Parcial**                                | README y documentación técnica                                                             | Informe final, resultados cuantitativos y video/demo                                     |

## Orden recomendado

1. Ajustar el tamaño físico conocido del marcador y validar PnP a una distancia medida.
2. Medir la sala real y reemplazar el mapa demo.
3. Probar corrección directa y suavizada.
4. Grabar recorridos repetibles, ejecutar `pnpm analyze` e incorporar los CSV al informe.
5. Ejecutar las repeticiones de la Fase 9 y preparar la entrega.

## Criterio de evidencia

Cada prueba manual debe registrar, como mínimo:

- fecha, dispositivo y versión de Chrome;
- configuración utilizada (`mode`, frecuencias y tamaño de imagen);
- captura o reporte generado por la aplicación;
- resultado observado y cualquier limitación;
- comandos automáticos ejecutados después de cambios de código.
