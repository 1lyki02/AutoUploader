import {
  generateLicenseKey,
  sha256,
} from "../_shared/license-utils.ts";

Deno.test("license keys have a human-readable random format", () => {
  const keys = new Set(Array.from({ length: 100 }, () => generateLicenseKey()));
  if (keys.size !== 100) throw new Error("Generated duplicate license keys");
  for (const key of keys) {
    if (!/^AU-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(key)) {
      throw new Error(`Invalid key format: ${key}`);
    }
  }
});

Deno.test("license hashing is deterministic", async () => {
  const first = await sha256("AU-ABCDE-FGHIJ-KLMNO-PQRST");
  const second = await sha256("AU-ABCDE-FGHIJ-KLMNO-PQRST");
  if (first !== second || first.length !== 64) throw new Error("Unexpected SHA-256 result");
});
