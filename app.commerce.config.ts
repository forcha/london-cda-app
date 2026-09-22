import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

export default defineConfig({
  metadata: {
    id: "customer-welcome-notifier",
    displayName: "Customer Welcome Notifier",
    description: "Notifies an external welcome service when a genuinely new Commerce customer account is created, using the event's own creation timestamp.",
    version: "1.1.0",
  },
  businessConfig: {
    schema: [
      {
        name: "welcome_service_url",
        type: "url",
        label: "Welcome Service URL",
        default: "https://aisenseapi.com/services/v1/webhook_capture",
      },
    ],
  },
  eventing: {
    commerce: [
      {
        provider: {
          label: "Customer Welcome Notifier",
          description: "Subscribes to customer save events and notifies a welcome service for new accounts",
        },
        events: [
          {
            name: "observer.customer_save_commit_after",
            label: "Customer Created",
            description: "Triggered when a Commerce customer account is saved and the action skips later profile and address updates",
            fields: [
              { name: "email" },
              { name: "created_at" },
              { name: "updated_at" },
            ],
            runtimeActions: ["customer-welcome/handle-customer-created"],
          },
        ],
      },
    ],
  },
});
