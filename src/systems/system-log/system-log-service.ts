export interface SystemLogEntry {
  readonly id: number;
  readonly timestamp: Date;
  readonly message: string;
}

export interface SystemLogService {
  write(message: string): void;
  entries(): readonly SystemLogEntry[];
}

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
