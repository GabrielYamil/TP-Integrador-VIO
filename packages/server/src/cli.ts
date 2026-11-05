/**
 * Utilidades mínimas para leer argumentos de línea de comandos.
 * No se usa una librería externa para mantener el servidor sin dependencias
 * innecesarias; el formato aceptado es `--nombre valor` y `--flag`.
 */

export function getArgument(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = argv[index + 1];
  return value !== undefined && !value.startsWith('--') ? value : undefined;
}

export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

export function parseIntegerOption(
  raw: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} debe ser un entero entre ${min} y ${max}; recibido: ${raw ?? fallback}`,
    );
  }
  return value;
}

export function parseNumberOption(
  raw: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      `${name} debe ser un número entre ${min} y ${max}; recibido: ${raw ?? fallback}`,
    );
  }
  return value;
}
