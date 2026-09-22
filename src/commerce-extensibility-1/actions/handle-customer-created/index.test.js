import assert from "node:assert/strict";
import test from "node:test";

const configModulePath = "@adobe/aio-commerce-lib-config";
const clientModulePath = "./welcome-service-client.js";

async function loadHandler() {
  return import("./index.js?" + Date.now());
}

test("returns capture_id for a new customer and uses configured URL", async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    if (fetchCalls.length === 1) {
      return new Response(JSON.stringify({ capture_id: "cap-123", update_url: "https://example.test/update" }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const imported = await import("node:module");
  const Module = imported.Module;
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === configModulePath) {
      return { getConfigurationByKey: async () => ({ welcome_service_url: "https://example.test/welcome" }) };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const { main } = await loadHandler();
    const response = await main({ data: { value: { email: "person@example.com", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" } } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capture_id, "cap-123");
    assert.equal(fetchCalls[0].url, "https://example.test/welcome");
  } finally {
    Module._load = originalLoad;
    global.fetch = originalFetch;
  }
});

test("skips updates without calling the external service", async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    const { main } = await loadHandler();
    const response = await main({ data: { value: { email: "person@example.com", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-02T00:00:00Z" } } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { skipped: true, reason: "customer-update" });
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("falls back to default URL when config read fails", async () => {
  const imported = await import("node:module");
  const Module = imported.Module;
  const originalLoad = Module._load;
  const configCalls = [];
  Module._load = function(request, parent, isMain) {
    if (request === configModulePath) {
      return { getConfigurationByKey: async () => { configCalls.push(true); throw new Error("config failed"); } };
    }
    if (request === clientModulePath) {
      return { DEFAULT_BASE_URL: "https://aisenseapi.com/services/v1/webhook_capture", notifyWelcomeService: async ({ baseUrl }) => ({ capture_id: baseUrl }) };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const { main } = await loadHandler();
    const response = await main({ data: { value: { email: "person@example.com", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" } } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.capture_id, "https://aisenseapi.com/services/v1/webhook_capture");
    assert.equal(configCalls.length, 1);
  } finally {
    Module._load = originalLoad;
  }
});
