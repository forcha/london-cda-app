const DEFAULT_BASE_URL = "https://aisenseapi.com/services/v1/webhook_capture";
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
  const statusCode = error?.statusCode ?? error?.response?.status;
  const code = error?.code;
  return RETRYABLE_STATUS_CODES.has(Number(statusCode)) || code === "ETIMEDOUT";
}

async function readResponseBody(response) {
  if (!response) {
    return "";
  }
  const text = await response.text();
  return text;
}

async function requestJson(url, options, attemptLogger, operation) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const bodyText = await readResponseBody(response);
      let parsedBody = {};
      if (bodyText) {
        parsedBody = JSON.parse(bodyText);
      }
      if (!response.ok) {
        const error = new Error(`Request failed with status ${response.status}`);
        error.statusCode = response.status;
        error.body = parsedBody;
        throw error;
      }
      return parsedBody;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      attemptLogger?.({
        attempt,
        error,
        operation,
        retryable,
      });
      if (!retryable || attempt === MAX_ATTEMPTS) {
        break;
      }
      await sleep(BASE_DELAY_MS * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export async function notifyWelcomeService({ baseUrl = DEFAULT_BASE_URL, email, createdAt, logger = console }) {
  const trimmedBaseUrl = String(baseUrl || DEFAULT_BASE_URL).trim();
  const logPrefix = { baseUrl: trimmedBaseUrl, email };

  try {
    const session = await requestJson(
      trimmedBaseUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      ({ attempt, error, operation, retryable }) => logger.warn("welcome-service request retry", { ...logPrefix, attempt, operation, retryable, error: error?.message, statusCode: error?.statusCode, code: error?.code }),
      "create-capture",
    );

    if (!session?.capture_id || !session?.update_url) {
      throw new Error("Welcome service response missing capture_id or update_url");
    }

    await requestJson(
      session.update_url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, created_at: createdAt }),
      },
      ({ attempt, error, operation, retryable }) => logger.warn("welcome-service request retry", { ...logPrefix, captureId: session.capture_id, attempt, operation, retryable, error: error?.message, statusCode: error?.statusCode, code: error?.code }),
      "update-capture",
    );

    return { capture_id: session.capture_id, update_url: session.update_url };
  } catch (error) {
    logger.error("welcome-service request failed", {
      ...logPrefix,
      error: error?.message,
      statusCode: error?.statusCode,
      code: error?.code,
      captureId: error?.capture_id,
    });
    throw error;
  }
}

export { DEFAULT_BASE_URL };
