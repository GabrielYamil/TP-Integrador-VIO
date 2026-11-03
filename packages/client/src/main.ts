type CheckStatus = 'ok' | 'warn' | 'fail' | 'pending';

interface CheckItem {
  label: string;
  status: CheckStatus;
  detail: string;
}

const checksEl = document.querySelector<HTMLUListElement>('#checks');
const healthEl = document.querySelector<HTMLSpanElement>('#health');
const originEl = document.querySelector<HTMLSpanElement>('#origin');
const uaEl = document.querySelector<HTMLParagraphElement>('#ua');
const localUrlEl = document.querySelector<HTMLAnchorElement>('#local-url');

function renderChecks(items: CheckItem[]): void {
  if (!checksEl) {
    return;
  }
  checksEl.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement('li');
      li.className = 'check';
      li.dataset.status = item.status;

      const dot = document.createElement('span');
      dot.className = 'dot';

      const body = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = item.label;
      const detail = document.createElement('span');
      detail.textContent = item.detail;
      body.append(label, detail);

      li.append(dot, body);
      return li;
    }),
  );
}

async function collectChecks(): Promise<CheckItem[]> {
  const secure = window.isSecureContext;
  const items: CheckItem[] = [
    {
      label: 'Contexto seguro (HTTPS)',
      status: secure ? 'ok' : 'fail',
      detail: secure
        ? 'La página se sirve por HTTPS o localhost.'
        : 'Abrí la página por HTTPS; WebXR no funciona en HTTP sobre la LAN.',
    },
  ];

  const xr = 'xr' in navigator ? navigator.xr : undefined;
  if (!xr) {
    items.push({
      label: 'WebXR disponible',
      status: 'fail',
      detail: 'navigator.xr no existe en este navegador.',
    });
    items.push({
      label: 'Sesión immersive-ar',
      status: 'fail',
      detail: 'Sin WebXR no se puede iniciar la sesión AR.',
    });
  } else {
    items.push({
      label: 'WebXR disponible',
      status: 'ok',
      detail: 'navigator.xr está presente.',
    });
    try {
      const supported = await xr.isSessionSupported('immersive-ar');
      items.push({
        label: 'Sesión immersive-ar',
        status: supported ? 'ok' : 'fail',
        detail: supported
          ? 'El navegador acepta sesiones immersive-ar.'
          : 'El dispositivo o navegador no soporta immersive-ar.',
      });
    } catch (error) {
      items.push({
        label: 'Sesión immersive-ar',
        status: 'fail',
        detail: `La consulta falló: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  items.push({
    label: 'Raw camera access',
    status: 'pending',
    detail: 'Se verifica dentro de la sesión AR, en /ar-test.html.',
  });

  return items;
}

async function checkHealth(): Promise<void> {
  if (!healthEl) {
    return;
  }
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      status?: string;
      version?: string;
      tls?: boolean;
    };
    healthEl.textContent = `Servidor: ${data.status ?? 'ok'} · v${data.version ?? '?'} · ${
      data.tls ? 'HTTPS' : 'HTTP'
    }`;
    healthEl.dataset.status = 'ok';
  } catch {
    healthEl.textContent = 'Servidor: no disponible (¿ejecutaste pnpm dev?)';
    healthEl.dataset.status = 'warn';
  }
}

async function main(): Promise<void> {
  if (originEl) {
    originEl.textContent = `Origen: ${window.location.origin}`;
  }
  if (uaEl) {
    uaEl.textContent = navigator.userAgent;
  }
  if (localUrlEl) {
    localUrlEl.textContent = window.location.origin;
    localUrlEl.href = window.location.origin;
  }

  renderChecks(await collectChecks());
  await checkHealth();
}

void main();
