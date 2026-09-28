import assert from "node:assert/strict";
import test from "node:test";
import { routeCreatorContact } from "../src/contact_workflow.js";
import { createInfraiClient, InfraiError } from "../src/infrai.js";

const submission = {
  requestId: "0f17cc8e-8bd9-4a67-9f9f-6520aa287119",
  name: "Mina Chen",
  email: "mina@example.com",
  requestType: "digital_asset_delivery" as const,
  message: "Please send the licensed photo pack for campaign C-104.",
  captchaToken: "browser-issued-token",
};
const workflowDependencies = {
  teamInbox: "team@example.com",
  captchaWidgetRecordId: "widget_104",
};

test("a rejected captcha stops the inbox email", async () => {
  const requestedPaths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    requestedPaths.push(new URL(String(input)).pathname);
    return new Response(
      JSON.stringify({ ok: false, error: { code: "BOT_CHECK_REJECTED", message: "Check rejected" } }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  };
  const infrai = createInfraiClient({ apiKey: "test-key", fetchImpl });

  await assert.rejects(
    routeCreatorContact(submission, { infrai, ...workflowDependencies }),
    (error: unknown) => error instanceof InfraiError && error.status === 422,
  );
  assert.deepEqual(requestedPaths, ["/v1/captcha/verify"]);
});

test("a verified request is labeled and routed once", async () => {
  const requests: Array<{ path: string; body: Record<string, unknown>; idempotencyKey: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push({
      path,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      idempotencyKey: new Headers(init?.headers).get("Idempotency-Key"),
    });
    const data = path.endsWith("captcha/verify") ? { verified: true } : { message_id: "msg_104" };
    return new Response(JSON.stringify({ ok: true, data, metadata: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const infrai = createInfraiClient({ apiKey: "test-key", fetchImpl });

  const result = await routeCreatorContact(submission, { infrai, ...workflowDependencies });

  assert.deepEqual(result, {
    requestId: submission.requestId,
    requestType: "digital_asset_delivery",
    messageId: "msg_104",
    state: "routed",
  });
  assert.deepEqual(requests.map((request) => request.path), [
    "/v1/captcha/verify",
    "/v1/email/send",
  ]);
  assert.equal(requests[1]?.idempotencyKey, submission.requestId);
  assert.equal(requests[0]?.body.widget_record_id, workflowDependencies.captchaWidgetRecordId);
  assert.match(String(requests[1]?.body.subject), /Digital asset delivery/);
  assert.match(String(requests[1]?.body.html), /licensed photo pack/);
});
