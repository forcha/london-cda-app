import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BASE_URL, notifyWelcomeService } from "./welcome-service-client.js";

test("posts empty body then sends customer data to update_url", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      return new Response(JSON.stringify({ capture_id: "cap-1", update_url: "https://example.test/update" }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const result = await notifyWelcomeService({
      baseUrl: DEFAULT_BASE_URL,
      email: "person@example.com",
      createdAt: "2024-01-01T00:00:00Z",
      logger: console,
    });

    assert.equal(result.capture_id, "cap-1");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, DEFAULT_BASE_URL);
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[1].url, "https://example.test/update");
    assert.equal(requests[1].options.method, "POST");
  } finally {
    global.fetch = originalFetch;
  }
});

test("retries transient failures and logs the failure after exhaustion", async () => {
  const originalFetch = global.fetch;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const warnings = [];
  const errors = [];
  console.warn = (...args) => warnings.push(args);
  console.error = (...args) => errors.push(args);

  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
  };

  try {
    await assert.rejects(() => notifyWelcomeService({
      baseUrl: DEFAULT_BASE_URL,
      email: "person@example.com",
      createdAt: "2024-01-01T00:00:00Z",
      logger: console,
    }));
    assert.equal(attempts, 4);
    assert.ok(warnings.length >= 3);
    assert.equal(errors.length >= 1, true);
  } finally {
    global.fetch = originalFetch;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  }
});
