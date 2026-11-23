/**
 * Avanza un reloj periódico sin acumular el jitter de cada frame.
 *
 * Devuelve la nueva referencia cuando corresponde emitir, o `null` si todavía
 * no venció el intervalo. Si pasaron varios intervalos, salta hasta el último
 * vencido pero permite como máximo un envío por frame.
 */
export function advanceRateLimitClock(
  timeMs: number,
  previousMs: number,
  rateHz: number,
): number | null {
  if (!Number.isFinite(timeMs) || !Number.isFinite(rateHz) || rateHz <= 0) {
    return null;
  }
  if (previousMs < 0 || !Number.isFinite(previousMs) || timeMs < previousMs) {
    return timeMs;
  }

  const intervalMs = 1000 / rateHz;
  const elapsedMs = timeMs - previousMs;
  if (elapsedMs < intervalMs) {
    return null;
  }

  const elapsedIntervals = Math.max(1, Math.floor(elapsedMs / intervalMs));
  return previousMs + elapsedIntervals * intervalMs;
}
