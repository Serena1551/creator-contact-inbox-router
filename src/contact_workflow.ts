import { z } from "zod";
import type { InfraiClient } from "./infrai.js";

export const contactSubmissionSchema = z.object({
  requestId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  requestType: z.enum(["digital_asset_delivery", "subscriber_updates", "content_processing"]),
  message: z.string().trim().min(10).max(4000),
  captchaToken: z.string().min(1),
});

export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;

const requestLabels: Record<ContactSubmission["requestType"], string> = {
  digital_asset_delivery: "Digital asset delivery",
  subscriber_updates: "Subscriber update",
  content_processing: "Content processing",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function routeCreatorContact(
  input: ContactSubmission,
  dependencies: {
    infrai: InfraiClient;
    teamInbox: string;
    captchaWidgetRecordId: string;
    ip?: string;
  },
) {
  await dependencies.infrai.captcha.verify({
    widget_record_id: dependencies.captchaWidgetRecordId,
    token: input.captchaToken,
    ip: dependencies.ip,
    action: "creator_contact",
    score_threshold: 0.5,
  });

  const label = requestLabels[input.requestType];
  const delivery = await dependencies.infrai.email.send(
    {
      to: dependencies.teamInbox,
      subject: `[Creator contact] ${label} from ${input.name}`,
      html: [
        `<p><strong>Request:</strong> ${escapeHtml(label)}</p>`,
        `<p><strong>Creator:</strong> ${escapeHtml(input.name)}</p>`,
        `<p><strong>Reply to:</strong> ${escapeHtml(input.email)}</p>`,
        `<p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`,
      ].join(""),
    },
    input.requestId,
  );

  return {
    requestId: input.requestId,
    requestType: input.requestType,
    messageId: delivery.message_id,
    state: "routed" as const,
  };
}
