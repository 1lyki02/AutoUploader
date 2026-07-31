import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { decryptCredentials, encryptCredentials, tokensEqual } from "../src/secrets.js";
import { isReauthenticationError } from "../src/worker.js";

test("credentials round-trip with authenticated encryption", () => {
  const key = randomBytes(32).toString("base64");
  const encrypted = encryptCredentials({ refreshToken: "secret" }, key);
  assert.deepEqual(
    decryptCredentials(encrypted, key),
    { refreshToken: "secret" },
  );
  const parts = encrypted.split(".");
  const ciphertext = Buffer.from(parts[3], "base64");
  ciphertext[0] ^= 1;
  parts[3] = ciphertext.toString("base64");
  assert.throws(() => decryptCredentials(parts.join("."), key));
});

test("API tokens use constant-size hash comparison", () => {
  assert.equal(tokensEqual("same-token", "same-token"), true);
  assert.equal(tokensEqual("same-token", "other-token"), false);
});

test("authentication failures are separated from uncertain publish failures", () => {
  assert.equal(isReauthenticationError("TikTok session недействительна"), true);
  assert.equal(isReauthenticationError("Instagram /challenge requested"), true);
  assert.equal(isReauthenticationError("Object storage timeout"), false);
});
