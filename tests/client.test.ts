import { LuminaClient, LuminaError } from "../src";

describe("LuminaClient — construction", () => {
  it("requires apiKey (allows empty string for onboarding)", () => {
    expect(() => new LuminaClient({ apiKey: "" })).not.toThrow();
    // @ts-expect-error — runtime check
    expect(() => new LuminaClient({})).toThrow(TypeError);
  });

  it("defaults to the production base URL", () => {
    const c = new LuminaClient({ apiKey: "test" });
    expect(c).toBeInstanceOf(LuminaClient);
  });

  it("accepts a custom base URL and strips trailing slashes", () => {
    const c = new LuminaClient({ apiKey: "test", baseUrl: "http://localhost:3000//" });
    expect(c).toBeInstanceOf(LuminaClient);
  });
});

describe("LuminaClient — fetch error mapping", () => {
  // We replace the global fetch with a stub for these tests so we don't hit
  // a real network. Restore after.
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps a JSON 4xx response into a LuminaError with code", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "invalid_api_key", message: "bad key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const c = new LuminaClient({ apiKey: "bad" });
    await expect(c.policies.list()).rejects.toMatchObject({
      name: "LuminaError",
      status: 401,
      message: "bad key",
      code: "invalid_api_key",
    });
  });

  it("maps a non-JSON 5xx into a LuminaError with statusText fallback", async () => {
    globalThis.fetch = (async () =>
      new Response("upstream timeout", {
        status: 504,
        statusText: "Gateway Timeout",
        headers: { "Content-Type": "text/plain" },
      })) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    const err = await c.policies.list().catch((e) => e);
    expect(err).toBeInstanceOf(LuminaError);
    expect((err as LuminaError).status).toBe(504);
  });

  it("wraps network errors as LuminaError with code=network_error", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const c = new LuminaClient({ apiKey: "x" });
    const err = await c.products.list().catch((e) => e);
    expect(err).toBeInstanceOf(LuminaError);
    expect((err as LuminaError).code).toBe("network_error");
    expect((err as LuminaError).status).toBe(0);
  });
});
