/** Erreur « métier » : son message est destiné au client et renvoyé tel quel. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.expose = true;
    this.details = details;
  }
}
