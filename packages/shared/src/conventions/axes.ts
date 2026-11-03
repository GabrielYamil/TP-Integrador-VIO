/**
 * Conversiones entre los tres marcos de cámara que aparecen en el proyecto.
 *
 * WebXR / odom:
 *   x derecha, y arriba, z hacia atrás. La cámara mira hacia -z.
 *
 * OpenCV / cámara de visión:
 *   x derecha, y abajo, z hacia adelante. La cámara mira hacia +z.
 *
 * ROS / world:
 *   x adelante, y izquierda, z arriba. La cámara inicial mira hacia +x.
 *
 * Convención de nombres:
 *   C_A_B es la rotación que lleva coordenadas expresadas en B a A:
 *     p_A = C_A_B * p_B
 *
 * Por eso C_WEBXR_CV aparece en la fórmula:
 *   T_odom_marker = T_odom_cam * C_WEBXR_CV * T_cam_marker
 *
 * Los valores son poses con traslación cero para poder componerlos con
 * `compose` sin casos especiales.
 */
import type { Pose } from '../math/se3';
import { poseFromQuatTranslation } from '../math/se3';

const ZERO = [0, 0, 0] as const;

/**
 * C_WEBXR_CV = diag(1, -1, -1).
 * Es una rotación de 180° sobre x (la rotación es su propia inversa).
 */
export const C_WEBXR_CV: Pose = poseFromQuatTranslation([1, 0, 0, 0], [...ZERO]);

/** C_CV_WEBXR = C_WEBXR_CV (autoinversa). */
export const C_CV_WEBXR: Pose = poseFromQuatTranslation([1, 0, 0, 0], [...ZERO]);

/**
 * C_ROS_WEBXR lleva (x derecha, y arriba, z atrás) a (x adelante, y izquierda, z arriba).
 *
 * Columnas de la rotación (imagen de cada eje WebXR en ROS):
 *   webxr x -> ros -y
 *   webxr y -> ros  z
 *   webxr z -> ros -x
 *
 * Es una rotación de 120° sobre el eje (1, -1, -1) / sqrt(3).
 */
export const C_ROS_WEBXR: Pose = poseFromQuatTranslation([0.5, -0.5, -0.5, 0.5], [...ZERO]);

/** Inversa de C_ROS_WEBXR. */
export const C_WEBXR_ROS: Pose = poseFromQuatTranslation([-0.5, 0.5, 0.5, 0.5], [...ZERO]);

/**
 * C_ROS_CV = C_ROS_WEBXR * C_WEBXR_CV.
 *
 * Columnas (imagen de cada eje OpenCV en ROS):
 *   cv x -> ros -y
 *   cv y -> ros -z
 *   cv z -> ros  x
 */
export const C_ROS_CV: Pose = poseFromQuatTranslation([-0.5, 0.5, -0.5, 0.5], [...ZERO]);

/** Inversa de C_ROS_CV. */
export const C_CV_ROS: Pose = poseFromQuatTranslation([0.5, -0.5, 0.5, 0.5], [...ZERO]);
