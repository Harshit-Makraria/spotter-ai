import type { RecentTrip, TripPlan, TripRequest } from "./types";

/**
 * In development Vite proxies /api to Django. In production the API lives on a
 * different host, supplied at build time.
 */
const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      "Could not reach the planning service. Check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    let code: string | undefined;
    try {
      const body = await response.json();
      code = body.error;
      detail =
        body.detail ??
        // DRF field errors arrive as { field: ["message"] }
        Object.entries(body)
          .filter(([key]) => key !== "error")
          .map(([key, value]) =>
            Array.isArray(value) ? `${humanise(key)}: ${value[0]}` : null,
          )
          .filter(Boolean)
          .join(" ") ??
        detail;
    } catch {
      /* keep the default message */
    }
    throw new ApiError(detail || `Request failed (${response.status}).`, response.status, code);
  }

  return response.json() as Promise<T>;
}

function humanise(field: string): string {
  const text = field.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function planTrip(payload: TripRequest): Promise<TripPlan> {
  return request<TripPlan>("/trips/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loadTrip(shareId: string): Promise<TripPlan> {
  return request<TripPlan>(`/trips/${encodeURIComponent(shareId)}/`);
}

/** Wakes a sleeping free-tier dyno so the first real request is fast. */
export function ping(): Promise<{ status: string }> {
  return request<{ status: string }>("/health/");
}

export function recentTrips(): Promise<RecentTrip[]> {
  return request<{ results: RecentTrip[] }>("/trips/recent/").then((body) => body.results);
}
