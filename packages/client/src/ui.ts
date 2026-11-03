export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Falta el elemento #${id} en el HTML`);
  }
  return element as T;
}

export function formatFixed(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export function formatVector(values: readonly number[], digits = 3): string {
  return `[${values.map((value) => formatFixed(value, digits)).join(', ')}]`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Se intenta el fallback de abajo.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function flashButton(button: HTMLButtonElement, text: string, ms = 1600): void {
  const original = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = original;
  }, ms);
}
