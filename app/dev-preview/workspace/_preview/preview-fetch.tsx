"use client";

import type { ReactNode } from "react";
import { answer, imageFor, type PreviewScenario } from "./fixtures";

/** Artificial latency so loading states flash the way they do against a real API. */
const MOCK_DELAY_MS = 150;
const ORIGINAL_FETCH = Symbol.for("linkar.devPreview.originalFetch");

type PreviewWindow = Window & { [ORIGINAL_FETCH]?: typeof fetch };

/** ?state=empty | error | slow; anything else is the populated workspace. Read per request. */
function currentScenario(): PreviewScenario {
  const state = new URLSearchParams(window.location.search).get("state");
  return state === "empty" || state === "error" || state === "slow" ? state : "populated";
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Resolves after `ms`, or rejects as soon as the caller aborts. */
function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = ms === Infinity ? undefined : window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return { url: new URL(href, window.location.origin), method, signal, body: init?.body };
}

function install(): void {
  if (typeof window === "undefined") return;
  const target = window as PreviewWindow;
  if (target[ORIGINAL_FETCH]) return;
  const original = window.fetch.bind(window);
  target[ORIGINAL_FETCH] = original;

  const shim = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { url, method, signal, body } = requestParts(input, init);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return original(input, init);
    }
    const result = answer(method, url, currentScenario(), body);
    if (result?.kind === "hang") {
      await wait(Infinity, signal);
      throw abortError();
    }
    await wait(MOCK_DELAY_MS, signal);
    if (!result) {
      console.warn(`[dev-preview] not mocked: ${method.toUpperCase()} ${url.pathname}${url.search}`);
      return new Response(JSON.stringify({ error: "not mocked" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
  };
  window.fetch = shim;

  // <img src="/api/..."> never goes through fetch. React sets src both with
  // setAttribute and (on mount) the src property, so swap known API image
  // routes for fixture data: URIs in both places.
  const rewrite = (value: unknown): unknown =>
    typeof value === "string" && value.startsWith("/api/") ? imageFor(new URL(value, window.location.origin)) ?? value : value;
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function previewSetAttribute(this: Element, name: string, value: string) {
    return setAttribute.call(this, name, this instanceof HTMLImageElement && name === "src" ? String(rewrite(value)) : value);
  };
  const srcProperty = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  if (srcProperty?.set && srcProperty.get) {
    const { get, set } = srcProperty;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...srcProperty,
      get,
      set(this: HTMLImageElement, value: string) {
        set.call(this, String(rewrite(value)));
      },
    });
  }
}

/**
 * Dev-only: swaps window.fetch for a fixture-backed shim before anything
 * below it renders, so the real workspace screens (and the module caches in
 * src/lib/client/workspace-data.ts) load fixtures instead of the API. The
 * install runs during render - not in an effect - because child effects run
 * before a parent's, and the children start fetching in theirs. It is
 * idempotent, so Strict Mode's double render and re-renders are harmless.
 */
export function PreviewFetch({ children }: { children: ReactNode }) {
  install();
  return <>{children}</>;
}
