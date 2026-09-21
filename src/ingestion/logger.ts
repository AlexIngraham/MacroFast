export interface IngestionLogger {
  info(message: string): void;
  warn(message: string): void;
}

export function createIngestionLogger(adapterKey: string): IngestionLogger {
  const prefix = `[${adapterKey}]`;
  return {
    info: (message) => void process.stdout.write(`${prefix} ${message}\n`),
    warn: (message) => void process.stderr.write(`${prefix} ${message}\n`),
  };
}
