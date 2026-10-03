export interface SystemLogEntry {
  readonly id: number;
  readonly timestamp: Date;
  readonly message: string;
}

export interface SystemLogService {
  write(message: string): void;
  entries(): readonly SystemLogEntry[];
}
