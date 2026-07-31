import {
  corsHeaders,
  jsonResponse,
  serviceRequest,
  sha256,
  signEntitlement,
} from "../_shared/license-utils.ts";

interface ActivationRow {
  license_id: string | null;
  result_status: "active" | "expired" | "invalid" | "revoked" | "already_activated";
  plan: string | null;
  expires_at: string | null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json() as {
      licenseKey?: string;
      machineId?: string;
      appVersion?: string;
      timestamp?: string;
    };
    const licenseKey = body.licenseKey?.trim().toUpperCase();
    const machineId = body.machineId?.trim();
    if (!licenseKey || !/^AU-[A-Z2-9-]+$/.test(licenseKey) || !machineId) {
      return jsonResponse({ error: "Invalid activation request" }, 400);
    }

    const machineIdHash = await sha256(machineId);
    const rows = await serviceRequest<ActivationRow[]>("rpc/activate_license", {
      method: "POST",
      body: JSON.stringify({
        p_key_hash: await sha256(licenseKey),
        p_machine_id_hash: machineIdHash,
      }),
    });
    const result = rows[0];
    const now = new Date();
    if (!result || result.result_status !== "active" || !result.license_id ||
      !result.plan || !result.expires_at) {
      return jsonResponse({
        status: result?.result_status ?? "invalid",
        plan: result?.plan ?? null,
        expiresAt: result?.expires_at ?? null,
        gracePeriodDays: 3,
        serverTime: now.toISOString(),
        entitlementToken: null,
      });
    }

    const expiresAt = new Date(result.expires_at);
    const graceLimit = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const offlineUntil = expiresAt < graceLimit ? expiresAt : graceLimit;
    const entitlementToken = await signEntitlement({
      iss: "autouploader-license",
      sub: result.license_id,
      plan: result.plan,
      installIdHash: machineIdHash,
      expiresAt: expiresAt.toISOString(),
      offlineUntil: offlineUntil.toISOString(),
      iat: Math.floor(now.getTime() / 1000),
    });

    return jsonResponse({
      status: "active",
      plan: result.plan,
      expiresAt: expiresAt.toISOString(),
      gracePeriodDays: 3,
      serverTime: now.toISOString(),
      entitlementToken,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "License service unavailable" }, 503);
  }
});
