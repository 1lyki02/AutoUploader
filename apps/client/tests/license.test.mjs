import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  entitlementIsUsable,
  hashInstallId,
  licenseAllowsPublishing,
  verifyEntitlementToken,
} from "../src/main/license/entitlement.ts";

function tokenFixture(installId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const now = new Date("2026-07-28T10:00:00.000Z");
  const payload = {
    iss: "autouploader-license",
    sub: "00000000-0000-4000-8000-000000000001",
    plan: "pro",
    installIdHash: hashInstallId(installId),
    expiresAt: "2026-08-28T10:00:00.000Z",
    offlineUntil: "2026-07-31T10:00:00.000Z",
    iat: Math.floor(now.getTime() / 1000),
  };
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${header}.${body}`;
  const signature = sign(null, Buffer.from(input), privateKey).toString("base64url");
  return {
    token: `${input}.${signature}`,
    publicJwk: publicKey.export({ format: "jwk" }),
    payload,
  };
}

test("signed entitlement is accepted only for its installation", () => {
  const installId = "00000000-0000-4000-8000-000000000002";
  const fixture = tokenFixture(installId);
  assert.deepEqual(
    verifyEntitlementToken(fixture.token, fixture.publicJwk, installId),
    fixture.payload,
  );
  assert.throws(() =>
    verifyEntitlementToken(
      fixture.token,
      fixture.publicJwk,
      "00000000-0000-4000-8000-000000000003",
    ));
});

test("tampered entitlement is rejected", () => {
  const installId = "00000000-0000-4000-8000-000000000002";
  const fixture = tokenFixture(installId);
  const [header, body, signature] = fixture.token.split(".");
  const tamperedBody = Buffer.from(JSON.stringify({
    ...fixture.payload,
    plan: "lifetime",
  })).toString("base64url");
  assert.throws(() =>
    verifyEntitlementToken(`${header}.${tamperedBody}.${signature}`, fixture.publicJwk, installId));
  assert.ok(body);
});

test("offline grace and subscription expiry are both enforced", () => {
  const fixture = tokenFixture("00000000-0000-4000-8000-000000000002");
  assert.equal(entitlementIsUsable(fixture.payload, new Date("2026-07-30T10:00:00Z")), true);
  assert.equal(entitlementIsUsable(fixture.payload, new Date("2026-08-01T10:00:00Z")), false);
  assert.equal(entitlementIsUsable({
    ...fixture.payload,
    offlineUntil: "2026-09-01T10:00:00.000Z",
  }, new Date("2026-08-29T10:00:00Z")), false);
});

test("main-process publishing requires an active unexpired entitlement", () => {
  const active = {
    status: "active",
    plan: "pro",
    expiresAt: "2026-08-28T10:00:00.000Z",
    offlineUntil: "2026-07-31T10:00:00.000Z",
    installId: "00000000-0000-4000-8000-000000000002",
    bypass: false,
  };
  assert.equal(licenseAllowsPublishing(active, new Date("2026-07-30T10:00:00Z")), true);
  assert.equal(licenseAllowsPublishing({ ...active, status: "revoked" }, new Date("2026-07-30T10:00:00Z")), false);
  assert.equal(licenseAllowsPublishing(active, new Date("2026-08-01T10:00:00Z")), false);
});
