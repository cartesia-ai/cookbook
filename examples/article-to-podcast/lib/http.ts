import { APIError, APIUserAbortError } from "@cartesia/cartesia-js";
import { APICallError } from "ai";
import { ConfigError } from "./env";
import { UnreadablePageError } from "./extract";
import { LlmConfigError } from "./llm";
import { FetchBlockedError } from "./safe-fetch";

export function errorResponse(err: unknown): Response {
  let status = 500;
  let message = "Something went wrong. Try again.";
  if (err instanceof ConfigError || err instanceof LlmConfigError) {
    status = 503;
    message = err.message;
  } else if (err instanceof FetchBlockedError) {
    status = 400;
    message = err.message;
  } else if (err instanceof UnreadablePageError) {
    status = 422;
    message = err.message;
  } else if (err instanceof APIUserAbortError) {
    status = 499;
    message = "The request was cancelled.";
  } else if (err instanceof APIError) {
    status = 502;
    message = `The Cartesia request failed${err.status ? ` (HTTP ${err.status})` : ""}.`;
  } else if (APICallError.isInstance(err)) {
    status = 502;
    message = `The language model request failed${err.statusCode ? ` (HTTP ${err.statusCode})` : ""}.`;
  } else if ((err as { name?: string })?.name === "AbortError") {
    status = 499;
    message = "The request was cancelled.";
  }
  const code = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  console.error(`[article-to-podcast] ${(err as Error)?.name ?? "Error"}${code ? ` status=${code}` : ""}`);
  return Response.json({ error: message }, { status });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function streamChunks(bytes: Uint8Array, size = 64 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + size));
      offset += size;
    },
  });
}
