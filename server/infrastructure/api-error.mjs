/** An expected request failure whose public message and HTTP status may be returned. */
export class ApiError extends Error {
  constructor(message, status = 502, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
