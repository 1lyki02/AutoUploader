import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.INTEGRATION_SERVER_URL?.replace(/\/+$/, "");
const token = process.env.INTEGRATION_SERVER_TOKEN;
const enabled = Boolean(baseUrl && token);

test("deployed API, PostgreSQL and R2 smoke flow", { skip: !enabled }, async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);

  const unauthorized = await fetch(`${baseUrl}/v1/jobs`);
  assert.equal(unauthorized.status, 401);

  const initiated = await fetch(`${baseUrl}/v1/uploads/initiate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: "integration-smoke.mp4",
      contentType: "video/mp4",
      sizeBytes: 1,
    }),
  });
  assert.equal(initiated.status, 200);
  const { uploadId } = await initiated.json() as { uploadId: string };

  const aborted = await fetch(`${baseUrl}/v1/uploads/${uploadId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(aborted.status, 204);
});
