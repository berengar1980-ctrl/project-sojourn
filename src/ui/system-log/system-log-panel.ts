import type { SystemLogEntry, SystemLogService } from '../../core/system-log-types';

export interface SystemLogPanel {
  update(): void;
  destroy(): void;
}

interface SystemLogPanelOptions {
  readonly root: HTMLElement;
  readonly log: SystemLogService;
  readonly header: string;
  readonly placementClass: string;
}

const VISIBLE_LOG_LINES = 8;

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function renderEntry(entry: SystemLogEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'system-log-line';
  row.textContent = '[' + formatTimestamp(entry.timestamp) + '] ' + entry.message;
  return row;
}

export function createSystemLogPanel(options: SystemLogPanelOptions): SystemLogPanel {
  const panel = document.createElement('aside');
  panel.className = 'system-log ' + options.placementClass;
  panel.setAttribute('aria-label', 'Bordcomputer Systemlog');
  panel.innerHTML = [
    '<div class="system-log-header">' + options.header + '</div>',
    '<div class="system-log-lines" aria-live="polite"></div>',
  ].join('');
  options.root.append(panel);

  const lines = panel.querySelector<HTMLElement>('.system-log-lines');
  if (!lines) throw new Error('System log panel is incomplete.');

  let lastRenderedId = -1;

  const update = (): void => {
    const entries = options.log.entries().slice(-VISIBLE_LOG_LINES);
    const newestId = entries.at(-1)?.id ?? -1;
    if (newestId === lastRenderedId) return;
    lines.replaceChildren(...entries.map(renderEntry));
    lastRenderedId = newestId;
  };

  update();

  return {
    update,
    destroy(): void {
      panel.remove();
    },
  };
}
