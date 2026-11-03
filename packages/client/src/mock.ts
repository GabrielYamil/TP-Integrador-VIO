import type { Pose } from '@vio/shared';
import { poseFromQuatTranslation, poseToWebXRMatrix } from '@vio/shared';
import { byId, copyText, flashButton, formatFixed, formatVector } from './ui';

const CAMERA_HEIGHT_M = 1.4;
const MOVE_SPEED_M_S = 1.2;
const YAW_SPEED_RAD_S = 1.6;
const SIMULATION_HZ = 30;
const TRAIL_MIN_STEP_M = 0.025;

const video = byId<HTMLVideoElement>('camera');
const videoEmpty = byId<HTMLDivElement>('video-empty');
const mapCanvas = byId<HTMLCanvasElement>('map');
const mapContext = mapCanvas.getContext('2d');
const cameraStatusEl = byId<HTMLSpanElement>('camera-status');
const fpsEl = byId<HTMLSpanElement>('mock-fps');
const posePEl = byId<HTMLElement>('pose-p');
const poseQEl = byId<HTMLElement>('pose-q');
const poseYawEl = byId<HTMLElement>('pose-yaw');
const cameraStartButton = byId<HTMLButtonElement>('camera-start');
const cameraStopButton = byId<HTMLButtonElement>('camera-stop');
const resetButton = byId<HTMLButtonElement>('reset');
const copyButton = byId<HTMLButtonElement>('copy');

const position: [number, number, number] = [0, CAMERA_HEIGHT_M, 0];
let yaw = 0;
let videoStream: MediaStream | null = null;
const pressed = new Set<string>();
const trail: Array<[number, number]> = [[0, 0]];

let lastSimulationTime = performance.now();
let simulationAccumulator = 0;
let simulationFrames = 0;
let lastFpsTime = performance.now();
let lastUiTime = 0;

function setPill(
  element: HTMLElement,
  text: string,
  status: 'ok' | 'warn' | 'fail' | 'pending',
): void {
  element.textContent = text;
  element.dataset.status = status;
}

function currentPose(): Pose {
  return poseFromQuatTranslation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], position);
}

function setVideoEmpty(title: string, detail: string): void {
  const strong = videoEmpty.querySelector('strong');
  const span = videoEmpty.querySelector('span');
  if (strong) {
    strong.textContent = title;
  }
  if (span) {
    span.textContent = detail;
  }
  videoEmpty.hidden = false;
}

function updatePoseUi(pose: Pose): void {
  posePEl.textContent = formatVector(pose.p, 3);
  poseQEl.textContent = formatVector(pose.q, 3);
  poseYawEl.textContent = `${formatFixed(yaw, 3)} rad`;
}

function stepSimulation(deltaSeconds: number): void {
  const forward = Number(pressed.has('KeyW')) - Number(pressed.has('KeyS'));
  const strafe = Number(pressed.has('KeyD')) - Number(pressed.has('KeyA'));
  const turn = Number(pressed.has('KeyQ')) - Number(pressed.has('KeyE'));
  const speedMultiplier = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 2 : 1;

  if (forward !== 0 || strafe !== 0) {
    const speed = MOVE_SPEED_M_S * speedMultiplier * deltaSeconds;
    // En WebXR +x es derecha y la cámara mira hacia -z.
    position[0] += strafe * speed;
    position[2] -= forward * speed;
    const previous = trail[trail.length - 1];
    const dx = position[0] - previous[0];
    const dz = position[2] - previous[1];
    if (Math.hypot(dx, dz) >= TRAIL_MIN_STEP_M) {
      trail.push([position[0], position[2]]);
      if (trail.length > 3000) {
        trail.shift();
      }
    }
  }

  if (turn !== 0) {
    yaw += turn * YAW_SPEED_RAD_S * deltaSeconds;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }
}

function drawMap(): void {
  if (!mapContext) {
    return;
  }
  const width = mapCanvas.width;
  const height = mapCanvas.height;
  const scale = height / 10;
  const centerX = width / 2;
  const centerY = height / 2;
  const toCanvas = (x: number, z: number): [number, number] => [
    centerX + x * scale,
    centerY + z * scale,
  ];

  mapContext.clearRect(0, 0, width, height);
  mapContext.fillStyle = '#050914';
  mapContext.fillRect(0, 0, width, height);

  mapContext.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  mapContext.lineWidth = 1;
  for (let meters = -5; meters <= 5; meters += 1) {
    const [gx] = toCanvas(meters, 0);
    const [, gy] = toCanvas(0, meters);
    mapContext.beginPath();
    mapContext.moveTo(gx, 0);
    mapContext.lineTo(gx, height);
    mapContext.stroke();
    mapContext.beginPath();
    mapContext.moveTo(0, gy);
    mapContext.lineTo(width, gy);
    mapContext.stroke();
  }

  const [originX, originY] = toCanvas(0, 0);
  mapContext.strokeStyle = 'rgba(110, 168, 255, 0.5)';
  mapContext.lineWidth = 1.5;
  mapContext.beginPath();
  mapContext.moveTo(originX - 8, originY);
  mapContext.lineTo(originX + 8, originY);
  mapContext.moveTo(originX, originY - 8);
  mapContext.lineTo(originX, originY + 8);
  mapContext.stroke();

  mapContext.strokeStyle = 'rgba(76, 224, 201, 0.7)';
  mapContext.lineWidth = 2;
  mapContext.beginPath();
  trail.forEach(([x, z], index) => {
    const [px, py] = toCanvas(x, z);
    if (index === 0) {
      mapContext.moveTo(px, py);
    } else {
      mapContext.lineTo(px, py);
    }
  });
  mapContext.stroke();

  const [px, py] = toCanvas(position[0], position[2]);
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const tipX = px + forwardX * scale * 0.45;
  const tipY = py + forwardZ * scale * 0.45;
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const backX = px - forwardX * scale * 0.2;
  const backY = py - forwardZ * scale * 0.2;

  mapContext.fillStyle = 'rgba(76, 224, 201, 0.2)';
  mapContext.strokeStyle = '#4ce0c9';
  mapContext.lineWidth = 2;
  mapContext.beginPath();
  mapContext.moveTo(tipX, tipY);
  mapContext.lineTo(backX + rightX * scale * 0.12, backY + rightZ * scale * 0.12);
  mapContext.lineTo(backX - rightX * scale * 0.12, backY - rightZ * scale * 0.12);
  mapContext.closePath();
  mapContext.fill();
  mapContext.stroke();

  mapContext.fillStyle = 'rgba(231, 238, 252, 0.7)';
  mapContext.font = '12px "Cascadia Code", monospace';
  mapContext.fillText('x →', width - 40, height - 12);
  mapContext.fillText('z ↓', width - 78, height - 28);
  mapContext.fillText(`yaw ${formatFixed(yaw, 2)} rad`, 12, 20);
  mapContext.fillText('odom / WebXR (vista cenital)', 12, height - 12);
}

function frame(now: number): void {
  const deltaSeconds = Math.min((now - lastSimulationTime) / 1000, 0.1);
  lastSimulationTime = now;
  simulationAccumulator += deltaSeconds;
  const step = 1 / SIMULATION_HZ;
  while (simulationAccumulator >= step) {
    stepSimulation(step);
    simulationAccumulator -= step;
    simulationFrames += 1;
  }

  const pose = currentPose();
  if (lastUiTime === 0 || now - lastUiTime >= 100) {
    lastUiTime = now;
    updatePoseUi(pose);
  }
  if (now - lastFpsTime >= 500) {
    fpsEl.textContent = `Simulación: ${formatFixed(simulationFrames, 0)} Hz`;
    simulationFrames = 0;
    lastFpsTime = now;
  }
  drawMap();
  window.requestAnimationFrame(frame);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

document.addEventListener('keydown', (event) => {
  if (isTypingTarget(event.target)) {
    return;
  }
  if (
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)
  ) {
    event.preventDefault();
    pressed.add(event.code);
  }
});

document.addEventListener('keyup', (event) => {
  pressed.delete(event.code);
});

window.addEventListener('blur', () => {
  pressed.clear();
});

async function startCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    setPill(cameraStatusEl, 'Cámara: no soportada', 'fail');
    setVideoEmpty('Sin getUserMedia', 'Este navegador no expone la cámara.');
    return;
  }
  cameraStartButton.disabled = true;
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = videoStream;
    await video.play();
    videoEmpty.hidden = true;
    setPill(cameraStatusEl, 'Cámara: activa', 'ok');
    cameraStopButton.disabled = false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPill(cameraStatusEl, 'Cámara: error', 'fail');
    setVideoEmpty('No se pudo abrir la cámara', message);
    cameraStartButton.disabled = false;
  }
}

function stopCamera(): void {
  videoStream?.getTracks().forEach((track) => track.stop());
  videoStream = null;
  video.srcObject = null;
  videoEmpty.hidden = false;
  setVideoEmpty('Webcam apagada', 'Activá la cámara para ver la entrada real.');
  setPill(cameraStatusEl, 'Cámara: apagada', 'pending');
  cameraStartButton.disabled = false;
  cameraStopButton.disabled = true;
}

function resetPose(): void {
  position[0] = 0;
  position[1] = CAMERA_HEIGHT_M;
  position[2] = 0;
  yaw = 0;
  trail.length = 0;
  trail.push([0, 0]);
  updatePoseUi(currentPose());
}

cameraStartButton.addEventListener('click', () => {
  void startCamera();
});
cameraStopButton.addEventListener('click', stopCamera);
resetButton.addEventListener('click', resetPose);
copyButton.addEventListener('click', () => {
  void (async () => {
    const pose = currentPose();
    const payload = {
      generatedAt: new Date().toISOString(),
      mode: 'mock',
      frame: 'odom (WebXR)',
      pose,
      matrix_webxr: Array.from(poseToWebXRMatrix(pose)),
      camera: cameraStatusEl.textContent,
      note: 'Pose simulada de escritorio; no proviene de ARCore.',
    };
    const ok = await copyText(JSON.stringify(payload, null, 2));
    flashButton(copyButton, ok ? 'Copiado' : 'No se pudo copiar');
  })();
});

setPill(cameraStatusEl, 'Cámara: apagada', 'pending');
setPill(fpsEl, 'Simulación: —', 'pending');
updatePoseUi(currentPose());
window.requestAnimationFrame(frame);
