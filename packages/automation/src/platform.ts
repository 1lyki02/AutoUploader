export type CamoufoxOs = "linux" | "macos" | "windows";

/** Camoufox fingerprint OS — must match the host platform for Instagram sessions. */
export function resolveCamoufoxOs(): CamoufoxOs {
  const env = process.env.CAMOUFOX_OS;
  if (env === "linux" || env === "macos" || env === "windows") return env;
  if (process.platform === "linux") return "linux";
  if (process.platform === "darwin") return "macos";
  return "windows";
}
