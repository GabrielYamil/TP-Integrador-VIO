/**
 * Conversión de timestamps para Foxglove.
 *
 * El servidor trabaja en milisegundos de época (`Date.now()`), pero
 * `@foxglove/ws-protocol` espera nanosegundos como `bigint` y los mensajes
 * `foxglove.*` usan `Time = { sec, nsec }`. Estas funciones hacen la conversión
 * una sola vez, sin perder los submilisegundos que pueda traer un mensaje.
 */
import type { Time } from '@foxglove/schemas';

const NS_PER_MS = 1_000_000n;
const NS_PER_S = 1_000_000_000n;

export function msToNs(ms: number): bigint {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(`Timestamp inválido: ${ms}`);
  }
  const wholeMs = Math.floor(ms);
  const fractionNs = Math.round((ms - wholeMs) * 1_000_000);
  return BigInt(wholeMs) * NS_PER_MS + BigInt(fractionNs);
}

export function msToTime(ms: number): Time {
  const totalNs = msToNs(ms);
  return {
    sec: Number(totalNs / NS_PER_S),
    nsec: Number(totalNs % NS_PER_S),
  };
}
