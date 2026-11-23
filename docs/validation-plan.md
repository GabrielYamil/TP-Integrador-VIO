# Plan de validación restante

Última actualización: **2026-11-22**.

Este documento separa lo que ya está demostrado de lo que todavía necesita una
prueba manual, un marcador físico o trabajo de implementación. La evidencia
detallada está en [`results.md`](results.md) y en [`evidence/`](evidence/).

## Estado por fase

| Fase                          | Estado local                               | Evidencia disponible                                                                       | Falta para cerrarla                                                                      |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 0 — entorno y HTTPS           | **Completada**                             | CA instalada en POCO X7 Pro, HTTPS LAN válido, `immersive-ar`, `local-floor` y sesión real | Nada del criterio principal                                                              |
| 1 — matemática y convenciones | **Completada**                             | 44 tests automáticos                                                                       | Nada                                                                                     |
| 2 — relay y Foxglove          | **Completada**                             | Simulador y telemetría real del POCO; cinco tópicos visibles                               | Conservar una captura final para el informe                                              |
| 3 — pose cruda WebXR          | **Parcial avanzada**                       | Tracking a 27–30 FPS, buffer 0, pose en Foxglove y deriva estacionaria de 1,7 mm en ~30 s  | Verificar de forma dirigida adelante/giro/altura y documentar los ejes                   |
| 4 — cámara e intrínsecos      | **Completada para el dispositivo probado** | `camera-access`, textura 864×1920, gris 288×640 a 10,2 Hz, intrínsecos estables y `hello`  | Calibración propia es opcional; solo hace falta si PnP no alcanza la precisión requerida |
| 5 — AprilTag y PnP            | **Implementada, no validada físicamente**  | Tests y código del worker                                                                  | Detectar ID 0, medir reproyección, distancia a 1 m y coherencia de ejes                  |
| 6 — corrección                | **Implementada, no validada físicamente**  | Tests del corrector                                                                        | Probar modos directo y suavizado con un marcador conocido y observar la relocalización   |
| 7 — Foxglove                  | **Completada**                             | Layout importado y validado en Foxglove Studio 3.6.0; cinco tópicos y telemetría real      | Guardar una captura final para el informe                                                |
| 8 — registro y evaluación     | **Parcial avanzada**                       | Grabador JSONL, analizador con 5 tests y exportación JSON/CSV                              | Grabar y analizar una corrida real; incorporar tabla y gráficos al informe               |
| 9 — pruebas de sala           | **Pendiente**                              | Mapa demo sintético                                                                        | Medir una sala, instalar marcadores y repetir cada condición al menos 3 veces            |
| 10 — entrega                  | **Parcial**                                | README y documentación técnica                                                             | Informe final, resultados cuantitativos y video/demo                                     |

## Orden recomendado

1. Terminar la validación dirigida de ejes de la Fase 3.
2. Probar detección del AprilTag ID 0 mostrado en una pantalla.
3. Ajustar el tamaño físico conocido del marcador y validar PnP.
4. Probar corrección directa y suavizada.
5. Medir la sala real y reemplazar el mapa demo.
6. Grabar recorridos reales, ejecutar `pnpm analyze` e incorporar los CSV al informe.
7. Ejecutar las repeticiones de la Fase 9 y preparar la entrega.

## Criterio de evidencia

Cada prueba manual debe registrar, como mínimo:

- fecha, dispositivo y versión de Chrome;
- configuración utilizada (`mode`, frecuencias y tamaño de imagen);
- captura o reporte generado por la aplicación;
- resultado observado y cualquier limitación;
- comandos automáticos ejecutados después de cambios de código.
