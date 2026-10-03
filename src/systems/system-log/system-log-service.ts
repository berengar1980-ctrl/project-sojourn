import type { SystemLogEntry, SystemLogService } from '../../core/system-log-types';

const MAX_LOG_ENTRIES = 40;

export function createSystemLogService(): SystemLogService {
  const log: SystemLogEntry[] = [];
  let nextId = 0;

  return {
    write(message): void {
      log.push({
        id: nextId,
        timestamp: new Date(),
        message,
      });
      nextId += 1;
      if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES);
    },
    entries(): readonly SystemLogEntry[] {
      return log;
    },
  };
}
