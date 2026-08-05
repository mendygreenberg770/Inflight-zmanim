/** Client-side JSON fetch with readable errors for non-JSON (HTML) responses. */

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();

  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML error page (host error, CPU limit, gateway error…)
  }

  if (json == null) {
    if (/exceeded|resource limit|1102|cpu time/i.test(text)) {
      throw new Error(
        "The server ran out of CPU time for this computation. On Cloudflare's FREE plan, Workers/Pages requests are limited to 10 ms of CPU — chart generation needs ~1–2 s. Fix: upgrade to Workers Paid ($5/mo, 30 s limit), or use the Vercel deployment for charts."
      );
    }
    throw new Error(
      `The server returned an error page instead of data (HTTP ${res.status}). Try again; if it persists, check the deployment's plan limits and logs.`
    );
  }

  if (!res.ok) {
    const err = json as { message?: string; error?: string };
    throw new Error(err.message ?? err.error ?? `Request failed (HTTP ${res.status})`);
  }
  return json as T;
}
