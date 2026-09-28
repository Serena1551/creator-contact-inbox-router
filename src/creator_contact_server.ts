import { createServer } from "node:http";
import { ZodError } from "zod";
import { contactSubmissionSchema, routeCreatorContact } from "./contact_workflow.js";
import { createInfraiClient, InfraiError } from "./infrai.js";

const teamInbox = process.env.TEAM_INBOX;
if (!teamInbox) throw new Error("TEAM_INBOX is required");
const captchaWidgetRecordId = process.env.CAPTCHA_WIDGET_RECORD_ID;
if (!captchaWidgetRecordId) throw new Error("CAPTCHA_WIDGET_RECORD_ID is required");

const infrai = createInfraiClient();
const port = Number(process.env.PORT ?? 3000);

function reply(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/contact") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = contactSubmissionSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await routeCreatorContact(input, {
      infrai,
      teamInbox,
      captchaWidgetRecordId,
      ip: request.socket.remoteAddress,
    });
    reply(response, 202, result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "Invalid contact submission" });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      reply(response, 422, { error: "Submission could not be accepted" });
      return;
    }
    console.error(error);
    reply(response, 500, { error: "Contact routing failed" });
  }
}).listen(port, () => {
  console.log(`Creator contact service listening on http://localhost:${port}`);
});
