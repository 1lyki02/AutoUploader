import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

export interface UniqueVideoHandle {
  filePath: string;
  cleanup: () => Promise<void>;
}

function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [
    typeof process.resourcesPath === "string"
      ? path.join(process.resourcesPath, "ffmpeg", exe)
      : null,
    path.join(here, "../vendor", exe),
    path.join(here, "../../vendor", exe),
    // Electron dev bundles main into apps/client/dist-electron/main.
    path.join(here, "../../../../packages/automation/vendor", exe),
    path.join(process.cwd(), "../../packages/automation/vendor", exe),
    path.join(process.cwd(), "packages/automation/vendor", exe),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    const fromPackage = require("ffmpeg-static") as string | null;
    if (fromPackage && existsSync(fromPackage)) return fromPackage;
  } catch {
    // ffmpeg-static may not be hoisted to the Electron app package.
  }

  return "ffmpeg";
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(
        new Error(
          `Не удалось запустить ffmpeg (${bin}). Установите ffmpeg или задайте FFMPEG_PATH. ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderr.slice(-800)}`));
    });
  });
}

/**
 * Creates a lightly altered temp copy so platforms treat re-uploads as a new file.
 * Changes: 1px crop from a random edge + tiny brightness nudge + unique metadata comment.
 */
export async function uniquifyVideo(sourcePath: string): Promise<UniqueVideoHandle> {
  const dir = await mkdtemp(path.join(tmpdir(), "road-unique-"));
  const ext = path.extname(sourcePath) || ".mp4";
  const outPath = path.join(dir, `upload-${Date.now()}${ext}`);

  const cropSide = randomInt(0, 4);
  const cropFilter =
    cropSide === 0
      ? "crop=iw-1:ih:1:0"
      : cropSide === 1
        ? "crop=iw-1:ih:0:0"
        : cropSide === 2
          ? "crop=iw:ih-1:0:1"
          : "crop=iw:ih-1:0:0";

  const brightness = (randomInt(0, 2) === 0 ? -1 : 1) * 0.01;
  const comment = `road-${Date.now()}-${randomInt(1e6, 1e9)}`;

  try {
    await runFfmpeg([
      "-y",
      "-i",
      sourcePath,
      "-vf",
      `${cropFilter},eq=brightness=${brightness}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-metadata",
      `comment=${comment}`,
      outPath,
    ]);
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return {
    filePath: outPath,
    cleanup: async () => {
      await unlink(outPath).catch(() => {});
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
