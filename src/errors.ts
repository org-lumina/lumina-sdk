/**
 * Thrown when the API responds with a non-2xx status.
 * The original HTTP status is on `.status`; the API's machine-readable error
 * code (e.g. `"invalid_api_key"`, `"shield_paused"`) is on `.code`.
 */
export class LuminaError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "LuminaError";
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, LuminaError.prototype);
  }
}
