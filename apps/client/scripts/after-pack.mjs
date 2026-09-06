import path from "node:path";
import { chmodSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * electron-builder skips rcedit when signAndEditExecutable=false,
 * so the Windows exe keeps the default Electron icon. Stamp our icon manually.
 */
export default async function afterPack(context) {
  const platform = context.electronPlatformName;

  if (platform === "win32") {
    const exeName = `${context.packager.appInfo.productFilename}.exe`;
    const exePath = path.join(context.appOutDir, exeName);
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const iconCandidates = [
      path.join(scriptDir, "../build/icon.ico"),
      path.resolve(context.appOutDir, "../../build/icon.ico"),
    ];
    const icon = iconCandidates.find((candidate) => existsSync(candidate));

    if (!existsSync(exePath) || !icon) {
      console.warn(`[afterPack] skip icon stamp: exe=${existsSync(exePath)} icon=${Boolean(icon)}`);
      return;
    }

    const { rcedit } = require("rcedit");
    await rcedit(exePath, { icon });
    console.log(`[afterPack] applied icon ${icon} -> ${exePath}`);
    return;
  }

  if (platform === "darwin") {
    const appName = `${context.packager.appInfo.productFilename}.app`;
    const appPath = path.join(context.appOutDir, appName);
    const ffmpegPath = path.join(appPath, "Contents/Resources/ffmpeg/ffmpeg");
    if (existsSync(ffmpegPath)) {
      chmodSync(ffmpegPath, 0o755);
      console.log(`[afterPack] chmod +x ${ffmpegPath}`);
    }

    // Ad-hoc sign so macOS does not report "app is damaged" for unsigned builds.
    // Sign nested helpers/binaries first, then the outer bundle.
    if (existsSync(appPath)) {
      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
      console.log(`[afterPack] ad-hoc signed ${appPath}`);
    } else {
      console.warn(`[afterPack] skip mac sign: app not found at ${appPath}`);
    }
  }
}
