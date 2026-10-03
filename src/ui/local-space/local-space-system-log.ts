export interface LocalSpaceSystemLog {
  write(message: string): void;
  destroy(): void;
}

const MAX_LOG_LINES = 8;

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function createLocalSpaceSystemLog(root: HTMLElement): LocalSpaceSystemLog {
  const panel = document.createElement('aside');
  panel.className = 'local-system-log';
  panel.setAttribute('aria-label', 'Bordcomputer Systemlog');
  panel.innerHTML = [
    '<div class="local-system-log-header">SYS // LOCAL OPS</div>',
    '<div class="local-system-log-lines" aria-live="polite"></div>',
  ].join('');
  root.append(panel);

  const lines = panel.querySelector<HTMLElement>('.local-system-log-lines');
  if (!lines) throw new Error('Local system log is incomplete.');

  const entries: HTMLElement[] = [];

  return {
    write(message): void {
      const row = document.createElement('div');
      row.className = 'local-system-log-line';
      row.textContent = '[' + formatTimestamp(new Date()) + '] ' + message;
      lines.append(row);
      entries.push(row);

      while (entries.length > MAX_LOG_LINES) {
        entries.shift()?.remove();
      }

      lines.scrollTop = lines.scrollHeight;
    },
    destroy(): void {
      panel.remove();
    },
  };
}
