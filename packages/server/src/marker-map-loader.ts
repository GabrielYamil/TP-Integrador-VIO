/**
 * Carga del mapa de marcadores con validación zod.
 *
 * El formato y las reglas están documentados en docs/conventions.md y
 * docs/marker-map.md. La validación vive en @vio/shared para que cliente y
 * servidor acepten exactamente el mismo archivo.
 */
import { readFileSync } from 'node:fs';
import type { MarkerMap } from '@vio/shared';
import { safeParseMarkerMap } from '@vio/shared';

export function loadMarkerMap(path: string): MarkerMap {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo leer el mapa de marcadores "${path}": ${message}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`El mapa de marcadores "${path}" no es JSON válido: ${message}`);
  }

  const result = safeParseMarkerMap(json);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const field = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `  ${field}: ${issue.message}`;
      })
      .join('\n');
    throw new Error(`Mapa de marcadores inválido (${path}):\n${details}`);
  }

  return result.data;
}
