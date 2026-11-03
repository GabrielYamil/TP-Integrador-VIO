# Mapa de marcadores

El mapa asigna una pose conocida en `world` a cada AprilTag. Es la referencia
que usa la corrección de localización de las fases 5 y 6. `config/marker_map.json`
contiene el mapa demo; el mapa real se mide en la sala y se carga con el mismo
formato.

## 1. Formato

```json
{
  "frame_id": "world",
  "dictionary": "APRILTAG_36h11",
  "markers": [
    {
      "id": 0,
      "size_m": 0.16,
      "position": [3.0, 0.0, 1.2],
      "orientation_xyzw": [0.0, 0.707107, 0.707107, 0.0]
    }
  ]
}
```

Reglas:

- `frame_id` debe ser `world`.
- `dictionary` debe ser `APRILTAG_36h11`.
- `size_m` es el lado completo del patrón impreso, incluido el borde negro
  exterior. En este proyecto son **0,16 m**. El papel A4 y la zona blanca de
  silencio no cuentan.
- `position` es el centro de la cara visible del marcador, en metros.
- `orientation_xyzw` es un cuaternión unitario `[x, y, z, w]`.
- Los IDs no se pueden repetir y el esquema rechaza campos extra.
- La validación está en `packages/shared/src/markers/map.ts` y se ejecuta con
  `pnpm test`.

## 2. Marco `world` de la sala demo

La sala demo mide **4,0 × 3,0 × 2,5 m**. El origen de `world` está en la esquina
suroeste del piso:

- `+x` va de la pared oeste a la este (ancho de 4 m).
- `+y` va de la pared sur a la norte (profundidad de 3 m).
- `+z` es la vertical, hacia arriba.
- La sala ocupa `x ∈ [0, 4]`, `y ∈ [0, 3]`, `z ∈ [0, 2.5]`.

Vista cenital (no está a escala):

```text
y ↑ (norte)
  +------------[2]--------[3]------------+  y = 3
  |                                      |
  |  [4]                          [5]    |  y = 1.5
  |                                      |
  +------------[1]--------[0]------------+  y = 0 (sur)
  x = 0       1.5         3.0           x = 4 (este)
```

Las paredes se nombran por su posición en `world`: sur (`y=0`), norte (`y=3`),
oeste (`x=0`) y este (`x=4`). La cara visible de cada marcador mira hacia el
interior de la sala.

## 3. Marcadores de la sala demo

La columna **offset** es la distancia desde la esquina izquierda de la pared
**vista desde adentro**, hasta el centro del marcador. Es la medida que usa
`markerPoseOnWall` y el script `tools/make_demo_map.py`; no siempre coincide con
la coordenada `x`.

|  ID | Pared         | Offset desde la izquierda | Altura del centro | `position` en `world` | `orientation_xyzw`               |
| --: | :------------ | ------------------------: | ----------------: | :-------------------- | :------------------------------- |
|   0 | sur (`y=0`)   |                    1,00 m |            1,20 m | `[3.0, 0.0, 1.2]`     | `[0.0, 0.707107, 0.707107, 0.0]` |
|   1 | sur (`y=0`)   |                    2,50 m |            1,20 m | `[1.5, 0.0, 1.2]`     | `[0.0, 0.707107, 0.707107, 0.0]` |
|   2 | norte (`y=3`) |                    1,00 m |            1,20 m | `[1.0, 3.0, 1.2]`     | `[0.707107, 0.0, 0.0, 0.707107]` |
|   3 | norte (`y=3`) |                    3,00 m |            1,20 m | `[3.0, 3.0, 1.2]`     | `[0.707107, 0.0, 0.0, 0.707107]` |
|   4 | oeste (`x=0`) |                    1,50 m |            1,20 m | `[0.0, 1.5, 1.2]`     | `[0.5, 0.5, 0.5, 0.5]`           |
|   5 | este (`x=4`)  |                    1,50 m |            1,20 m | `[4.0, 1.5, 1.2]`     | `[-0.5, 0.5, 0.5, -0.5]`         |

Los valores de los cuaterniones están redondeados a seis decimales; el archivo
`config/marker_map.json` es la fuente de verdad y los tests comprueban que
coincida con `markerPoseOnWall`.

### Orientación física

Cada marcador se imprime con el texto en la parte inferior y se instala con el
lado del texto hacia abajo. Su marco local es:

- `+x`: a la derecha del marcador visto de frente.
- `+y`: hacia arriba.
- `+z`: saliendo de la cara visible, hacia el interior de la sala.

La siguiente tabla ayuda a comprobar la orientación durante el montaje:

|  ID | Pared | `+x` del marcador en `world` | `+z` del marcador en `world` |
| --: | :---- | :--------------------------- | :--------------------------- |
|   0 | sur   | `[-1, 0, 0]` (oeste)         | `[0, 1, 0]` (norte)          |
|   1 | sur   | `[-1, 0, 0]` (oeste)         | `[0, 1, 0]` (norte)          |
|   2 | norte | `[1, 0, 0]` (este)           | `[0, -1, 0]` (sur)           |
|   3 | norte | `[1, 0, 0]` (este)           | `[0, -1, 0]` (sur)           |
|   4 | oeste | `[0, 1, 0]` (norte)          | `[1, 0, 0]` (este)           |
|   5 | este  | `[0, -1, 0]` (sur)           | `[-1, 0, 0]` (oeste)         |

Si un marcador se instala girado 90° o 180° respecto de esta tabla, el PnP
seguirá detectando el patrón, pero la pose del marcador en el mapa no va a
coincidir con la realidad y la corrección será incorrecta.

## 4. Generar e imprimir los marcadores

Desde la raíz:

```powershell
pnpm markers
```

El comando genera:

- `markers/marker_00_id0.png` … `markers/marker_05_id5.png`, con el patrón a
  1890 × 1890 px y 300 DPI.
- `markers/markers_A4.pdf`, una hoja A4 por marcador.

Cada hoja tiene:

- el patrón de **16,0 cm** de lado;
- una zona blanca de silencio de **2,0 cm** alrededor;
- una regla impresa de **10,0 cm** para verificar la escala.

Procedimiento de impresión:

1. Imprimí el PDF en **A4 al 100 %**. No uses "ajustar a la página",
   "escalar para ajustar" ni "ampliar márgenes".
2. Medí la regla de 10 cm. Si no mide 10,0 cm, la impresión está escalada:
   corregí la configuración de la impresora y repetí.
3. Medí el lado exterior del cuadrado negro. Debe medir 16,0 cm.
4. Verificá que el margen blanco de 2 cm quede completo. No lo recortes.
5. Pegá el marcador sobre cartón, foamboard o una superficie rígida y plana.
   El papel suelto se curva y arruina la estimación de pose.
6. Evitá laminados brillantes y reflejos directos.

Los PNG y el PDF están ignorados por git porque son artefactos regenerables.

## 5. Medir un mapa real

El mapa real se construye una sola vez por sala y se versiona en
`config/marker_map.json` (sin los certificados ni las fotos).

### 5.1. Definir el origen

1. Elegí una esquina del piso y marcala como origen `(0, 0, 0)`.
2. Elegí el eje `+x` a lo largo de una pared y el `+y` perpendicular, con `+z`
   hacia arriba. La terna debe ser derecha: `x × y = z`.
3. Anotá la orientación en el piso o en un plano. Todo el equipo debe usar el
   mismo origen y los mismos ejes.

La convención recomendada es la de la sala demo: `+x` hacia el este, `+y` hacia
el norte y `+z` hacia arriba.

### 5.2. Medir cada marcador

Para cada ID:

1. Medí la posición del **centro de la cara visible** con cinta métrica o
   medidor láser. No midas la esquina del papel.
2. Medí la altura del centro sobre el piso. La sala demo usa 1,20 m.
3. Medí la distancia desde la esquina izquierda de la pared, vista desde
   adentro, hasta el centro.
4. Verificá la orientación física con la tabla de la sección 3.
5. Anotá los valores en metros con al menos tres decimales.

### 5.3. Cargar los valores

Para una sala rectangular se puede usar `markerPoseOnWall` desde
`packages/shared` o adaptar `tools/make_demo_map.py`. El script demo tiene las
dimensiones y las colocaciones en constantes al comienzo del archivo:

```python
ROOM = {"width_m": 4.0, "depth_m": 3.0, "height_m": 2.5}
MARKER_SIZE_M = 0.16
PLACEMENTS = [
    (0, "south", 1.0, 1.2),
    # ...
]
```

Al cambiar la sala hay que actualizar también las constantes y los casos de
`packages/shared/src/markers/map.test.ts`, porque ese test compara el JSON
versionado contra la geometría demo. Si el mapa se edita a mano, se puede
mantener el test apuntando a otra sala solo después de actualizar sus
colocaciones.

El JSON se puede validar con:

```powershell
pnpm --filter @vio/shared test
```

### 5.4. Verificación del mapa

Antes de usarlo para corregir la localización:

- [ ] Todos los IDs del mapa están impresos y colocados.
- [ ] No hay IDs repetidos.
- [ ] `frame_id` es `world` y `dictionary` es `APRILTAG_36h11`.
- [ ] `size_m` coincide con el tamaño medido del patrón.
- [ ] Las posiciones están en el mismo sistema de ejes.
- [ ] Las orientaciones respetan `+x` derecha, `+y` arriba y `+z` hacia la
      cámara.
- [ ] El mapa pasa `pnpm test`.
- [ ] La distancia entre dos marcadores medida con cinta coincide con la
      distancia entre sus posiciones en el JSON (error menor a 1 cm).

## 6. Estado actual

El mapa versionado es **sintético** y corresponde a la sala demo de 4 × 3 × 2,5
m. Todavía no se midió una sala real ni se validó la orientación de los
marcadores impresos con el celular. Esa validación pertenece a las fases 5, 6 y
9; ver `docs/results.md`.
