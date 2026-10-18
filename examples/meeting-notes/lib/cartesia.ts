import Cartesia from "@cartesia/cartesia-js";

export class MissingKeyError extends Error {
  constructor() {
    super("CARTESIA_API_KEY is not set. Add it to .env.local and restart.");
  }
}

export function getCartesia(): Cartesia {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new MissingKeyError();
  return new Cartesia({ apiKey });
}
