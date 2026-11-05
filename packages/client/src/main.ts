type CheckStatus = 'ok' | 'warn' | 'fail' | 'pending';

interface CheckItem {
  label: string;
  status: CheckStatus;
  detail: string;
}

interface HealthResponse {
  status?: string;
  version?: string;
  tls?: boolean;
  ingest?: {
    clients?: number;
    messagesValid?: number;
    messagesInvalid?: number;
    byType?: Record<string, number>;
  } | null;
  foxglove?: {
    host?: string;
    port?: number;
    clients?: number;
    subscribed_topics?: string[];
  } | null;
}

const checksEl = document.querySelector<HTMLUListElement>('#checks');
const healthEl = document.querySelector<HTMLSpanElement>('#health');
const originEl = document.querySelector<HTMLSpanElement>('#origin');
const uaEl = document.querySelector<HTMLParagraphElement>('#ua');
const localUrlEl = document.querySelector<HTMLAnchorElement>('#local-url');
const relayIngestEl = document.querySelector<HTMLSpanElement>('#relay-ingest');
const relayFoxgloveEl = document.querySelector<HTMLSpanElement>('#relay-foxglove');
const foxgloveUrlEl = document.querySelector<HTMLElement>('#foxglove-url');

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
    const data = (await response.json()) as HealthResponse;
    healthEl.textContent = `Servidor: ${data.status ?? 'ok'} · v${data.version ?? '?'} · ${
      data.tls ? 'HTTPS' : 'HTTP'
    }`;
    healthEl.dataset.status = 'ok';
    renderRelayHealth(data);
  } catch {
    healthEl.textContent = 'Servidor: no disponible (¿ejecutaste pnpm dev?)';
    healthEl.dataset.status = 'warn';
    if (relayIngestEl) {
      relayIngestEl.textContent = 'Ingesta: servidor no disponible';
      relayIngestEl.dataset.status = 'warn';
    }
    if (relayFoxgloveEl) {
      relayFoxgloveEl.textContent = 'Foxglove: servidor no disponible';
      relayFoxgloveEl.dataset.status = 'warn';
    }
  }
}

function renderRelayHealth(data: HealthResponse): void {
  const ingest = data.ingest;
  if (relayIngestEl) {
    if (ingest) {
      relayIngestEl.textContent = `Ingesta: ${ingest.clients ?? 0} clientes · ${
        ingest.messagesValid ?? 0
      } válidos · ${ingest.messagesInvalid ?? 0} inválidos`;
      relayIngestEl.dataset.status = (ingest.messagesInvalid ?? 0) > 0 ? 'warn' : 'ok';
    } else {
      relayIngestEl.textContent = 'Ingesta: sin datos';
      relayIngestEl.dataset.status = 'warn';
    }
  }

  const foxglove = data.foxglove;
  if (relayFoxgloveEl) {
    if (foxglove) {
      const topics = foxglove.subscribed_topics?.length ?? 0;
      relayFoxgloveEl.textContent = `Foxglove: ${foxglove.clients ?? 0} clientes · ${topics} tópicos suscriptos`;
      relayFoxgloveEl.dataset.status = 'ok';
    } else {
      relayFoxgloveEl.textContent = 'Foxglove: sin datos';
      relayFoxgloveEl.dataset.status = 'warn';
    }
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
  if (foxgloveUrlEl) {
    foxgloveUrlEl.textContent = `ws://${window.location.hostname}:8765`;
  }

  renderChecks(await collectChecks());
  await checkHealth();
}

void main();
