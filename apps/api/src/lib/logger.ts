/** The subset of pino's API the services use, so they don't depend on Fastify. */
export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
