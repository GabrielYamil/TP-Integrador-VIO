/**
 * Transformación inicial entre world y odom.
 *
 * Al iniciar la sesión WebXR todavía no hay ningún marcador observado. Para no
 * cambiar de convención de ejes a mitad de camino, se define desde el primer
 * frame:
 *
 *   T_world_odom = T_WORLD_ODOM_INITIAL
 *
 * con traslación cero y la rotación C_ROS_WEBXR. El origen de `world` queda en
 * el origen de la sesión AR y su eje +x apunta hacia donde miraba la cámara al
 * iniciar (la cámara WebXR mira hacia -z).
 *
 * Cuando se observa el primer marcador, la Fase 6 reemplaza esta estimación por
 * la que impone el mapa.
 */
import type { Pose } from '../math/se3';
import { C_ROS_WEBXR } from './axes';

export const T_WORLD_ODOM_INITIAL: Pose = {
  p: [0, 0, 0],
  q: [...C_ROS_WEBXR.q],
};

/** Devuelve una copia para evitar mutaciones accidentales de la constante. */
export function worldFromOdomInitial(): Pose {
  return { p: [...T_WORLD_ODOM_INITIAL.p], q: [...T_WORLD_ODOM_INITIAL.q] };
}
