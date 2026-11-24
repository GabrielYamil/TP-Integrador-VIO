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
| 5 — AprilTag y PnP            | **Completada en POCO X7 Pro**              | Tag de 16 cm a 60 cm; error −6,23 %; reproyección 0,28 px; ejes coherentes                 | Calibración propia opcional si se necesita mayor precisión                               |
| 6 — corrección                | **Completada en mapa controlado**          | Directo/suavizado/Off; posición absoluta con error 3D de 5,8 cm                            | Nada del criterio principal; el mapa completo de sala corresponde a la Fase 9            |
| 7 — Foxglove                  | **Completada**                             | Layout importado y validado en Foxglove Studio 3.6.0; cinco tópicos y telemetría real      | Guardar una captura final para el informe                                                |
| 8 — registro y evaluación     | **Completada**                             | Corrida real: 724 poses, 26,57 Hz, tracking 100 %, cierre crudo 26,96 cm                   | Usar los resultados locales para los gráficos de la Fase 10                              |
| 9 — pruebas físicas           | **Completada en montaje controlado**       | 9 recorridos y 12 sesiones variables; CSV, JSON y gráficos                                 | Sala multimarcador queda como limitación documentada                                     |
| 10 — entrega                  | **Avanzada**                               | Informe final, resultados cuantitativos, gráficos y guion                                  | Grabar el video/demo                                                                     |

## Orden recomendado

1. Grabar el video/demo siguiendo `docs/video-demo-script.md`.
2. Opcional: repetir en una sala multimarcador para ampliar la generalización.

## Criterio de evidencia

Cada prueba manual debe registrar, como mínimo:

- fecha, dispositivo y versión de Chrome;
- configuración utilizada (`mode`, frecuencias y tamaño de imagen);
- captura o reporte generado por la aplicación;
- resultado observado y cualquier limitación;
- comandos automáticos ejecutados después de cambios de código.
