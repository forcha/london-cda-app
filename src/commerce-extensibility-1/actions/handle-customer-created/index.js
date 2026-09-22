import { getConfigurationByKey } from "@adobe/aio-commerce-lib-config";
import { DEFAULT_BASE_URL, notifyWelcomeService } from "./welcome-service-client.js";

const CONFIG_KEY = "welcome_service_url";

function getLogger() {
  return console;
}

function isNewCustomer(createdAt, updatedAt) {
  return createdAt === updatedAt;
}

async function resolveWelcomeServiceUrl(logger) {
  try {
    const config = await getConfigurationByKey("global", "global");
    const value = config?.[CONFIG_KEY];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  } catch (error) {
    logger.warn("welcome service config read failed; falling back to default", {
      configKey: CONFIG_KEY,
      error: error?.message,
    });
  }
  return DEFAULT_BASE_URL;
}

export async function main(params) {
  const logger = getLogger();
  try {
    const value = params?.data?.value || {};
    const email = value.email;
    const createdAt = value.created_at;
    const updatedAt = value.updated_at;

    if (!email || !createdAt || !updatedAt) {
      return {
        statusCode: 400,
        body: { error: "Missing required customer fields" },
      };
    }

    if (!isNewCustomer(createdAt, updatedAt)) {
      return {
        statusCode: 200,
        body: { skipped: true, reason: "customer-update" },
      };
    }

    const baseUrl = await resolveWelcomeServiceUrl(logger);
    const result = await notifyWelcomeService({
      baseUrl,
      email,
      createdAt,
      logger,
    });

    return {
      statusCode: 200,
      body: { capture_id: result.capture_id },
    };
  } catch (error) {
    logger.error("handle-customer-created failed", {
      error: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
    });
    return {
      statusCode: 500,
      body: { error: "Failed to process customer created event" },
    };
  }
}
