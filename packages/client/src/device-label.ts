/**
 * Etiqueta corta del dispositivo para el mensaje `hello`.
 *
 * Se evita enviar el User-Agent completo si se puede extraer el modelo de
 * Android. El esquema `hello` limita `device` a 256 caracteres.
 */
export function describeDevice(userAgent: string): string {
  const android = /Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/i.exec(userAgent);
  if (android?.[1]) {
    const model = android[1].replace(/\s+wv$/i, '').trim();
    if (model.length > 0) {
      return model.slice(0, 256);
    }
  }

  const chrome = /(?:Chrome|CriOS)\/([\d.]+)/i.exec(userAgent);
  if (chrome?.[1]) {
    return `Chrome ${chrome[1]}`;
  }

  const trimmed = userAgent.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 256) : 'dispositivo desconocido';
}
