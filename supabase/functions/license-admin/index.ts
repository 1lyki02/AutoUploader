import {
  adminTokenIsValid,
  corsHeaders,
  generateLicenseKey,
  jsonResponse,
  serviceRequest,
  sha256,
} from "../_shared/license-utils.ts";

interface LicenseRow {
  id: string;
  key_prefix: string;
  customer_name: string;
  customer_contact: string | null;
  plan: string;
  duration_days: number;
  status: "unactivated" | "active" | "expired" | "revoked";
  machine_id_hash: string | null;
  activated_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function toSummary(row: LicenseRow) {
  const effectiveStatus = row.status === "active" && row.expires_at &&
      new Date(row.expires_at).getTime() <= Date.now()
    ? "expired"
    : row.status;
  return {
    id: row.id,
    keyPrefix: row.key_prefix,
    customerName: row.customer_name,
    customerContact: row.customer_contact,
    plan: row.plan,
    durationDays: row.duration_days,
    status: effectiveStatus,
    activatedAt: toIso(row.activated_at),
    expiresAt: toIso(row.expires_at),
    deviceBound: Boolean(row.machine_id_hash),
    notes: row.notes,
    createdAt: toIso(row.created_at) ?? row.created_at,
    updatedAt: toIso(row.updated_at) ?? row.updated_at,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!await adminTokenIsValid(request.headers.get("x-admin-token"))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.searchParams.get("events")) {
      const licenseId = encodeURIComponent(url.searchParams.get("events") ?? "");
      return jsonResponse(await serviceRequest(
        `license_events?license_id=eq.${licenseId}&select=id,event_type,details,created_at&order=created_at.desc&limit=200`,
      ));
    }
    if (request.method === "GET") {
      const rows = await serviceRequest<LicenseRow[]>(
        "licenses?select=*&order=created_at.desc&limit=1000",
      );
      return jsonResponse(rows.map(toSummary));
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await request.json() as Record<string, unknown>;
    if (body.action === "generate") {
      const customerName = String(body.customerName ?? "").trim();
      const customerContact = String(body.customerContact ?? "").trim() || null;
      const plan = String(body.plan ?? "pro").trim();
      const durationDays = Number(body.durationDays);
      const notes = String(body.notes ?? "").trim() || null;
      if (!customerName || !plan || !Number.isInteger(durationDays) ||
        durationDays < 1 || durationDays > 3650) {
        return jsonResponse({ error: "Invalid license data" }, 400);
      }
      const licenseKey = generateLicenseKey();
      const rows = await serviceRequest<LicenseRow[]>("licenses", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          key_hash: await sha256(licenseKey),
          key_prefix: licenseKey.slice(0, 8),
          customer_name: customerName,
          customer_contact: customerContact,
          plan,
          duration_days: durationDays,
          notes,
        }),
      });
      const license = rows[0];
      if (!license) throw new Error("Created license was not returned");
      await serviceRequest("license_events", {
        method: "POST",
        body: JSON.stringify({
          license_id: license.id,
          event_type: "generated",
          details: { durationDays, plan },
        }),
      });
      return jsonResponse({ license: toSummary(license), licenseKey }, 201);
    }

    const action = String(body.action ?? "");
    const licenseId = String(body.licenseId ?? "");
    const days = body.days === undefined ? null : Number(body.days);
    if (!["extend", "revoke", "restore", "reset-device"].includes(action) ||
      !/^[0-9a-f-]{36}$/i.test(licenseId)) {
      return jsonResponse({ error: "Invalid admin action" }, 400);
    }
    const result = await serviceRequest<LicenseRow | LicenseRow[]>(
      "rpc/admin_update_license",
      {
        method: "POST",
        body: JSON.stringify({
          p_license_id: licenseId,
          p_action: action,
          p_days: days,
        }),
      },
    );
    const license = Array.isArray(result) ? result[0] : result;
    if (!license) throw new Error("Updated license was not returned");
    return jsonResponse(toSummary(license));
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Admin operation failed" }, 500);
  }
});
