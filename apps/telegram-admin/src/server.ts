import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  GenerateLicenseRequestSchema,
  LicenseAdminActionSchema,
} from "@autouploader/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppConfig } from "./config.js";
import {
  assertAdminUser,
  validateTelegramInitData,
} from "./auth/telegram-webapp.js";
import { LicenseAdminClient } from "./license-api.js";

type Variables = {
  telegramUserId: number;
};

function extractInitData(authorization: string | undefined, headerInitData: string | undefined): string {
  if (headerInitData?.trim()) return headerInitData.trim();
  if (!authorization) return "";
  const trimmed = authorization.trim();
  if (trimmed.toLowerCase().startsWith("tma ")) {
    return trimmed.slice(4).trim();
  }
  return "";
}

/** Absolute path to built Mini App (`web/dist`), independent of process.cwd(). */
export function resolveWebRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/dist");
}

function mountStatic(app: Hono<{ Variables: Variables }>, webRoot: string): void {
  const indexHtml = path.join(webRoot, "index.html");
  if (!existsSync(indexHtml)) {
    app.get("/", (c) =>
      c.html(
        `<!doctype html><html lang="ru"><body style="font-family:sans-serif;padding:2rem;background:#1c1c1e;color:#f2f2f7">
        <h1>ROAD License Mini App</h1>
        <p>Статика ещё не собрана. В dev открой Vite или выполни <code>pnpm --filter @autouploader/telegram-admin build</code>.</p>
        <p>API: <code>/api/licenses</code> (нужен Telegram initData).</p>
        </body></html>`,
      ),
    );
    return;
  }

  // serveStatic root must be relative to cwd; rewrite to absolute via symlink-style join.
  // Use absolute root — Node path.join keeps absolute first segment on Windows/Unix.
  app.use(
    "/*",
    serveStatic({
      root: webRoot,
      rewriteRequestPath: (reqPath) => reqPath,
    }),
  );

  app.get("*", async (c) => {
    const html = await readFile(indexHtml, "utf8");
    return c.html(html);
  });
}

export function createApp(config: AppConfig): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>();
  const api = new LicenseAdminClient(config);
  const webRoot = resolveWebRoot();

  app.use(
    "/api/*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization", "X-Telegram-Init-Data"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.get("/health", (c) =>
    c.json({
      ok: true,
      webapp: Boolean(config.webAppUrl),
      static: existsSync(path.join(webRoot, "index.html")),
      webRoot,
    }),
  );

  app.use("/api/*", async (c, next) => {
    try {
      const initData = extractInitData(
        c.req.header("authorization"),
        c.req.header("x-telegram-init-data"),
      );
      const validated = validateTelegramInitData(initData, config.botToken);
      assertAdminUser(validated.user.id, config.adminIds);
      c.set("telegramUserId", validated.user.id);
      await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 401);
    }
  });

  app.get("/api/licenses", async (c) => {
    try {
      const rows = await api.list();
      return c.json(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 502);
    }
  });

  app.post("/api/licenses/generate", async (c) => {
    try {
      const body = GenerateLicenseRequestSchema.parse(await c.req.json());
      const result = await api.generate(body);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 400);
    }
  });

  app.post("/api/licenses/action", async (c) => {
    try {
      const body = LicenseAdminActionSchema.parse(await c.req.json());
      const result = await api.action(body);
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/licenses/:id/events", async (c) => {
    try {
      const id = c.req.param("id");
      const events = await api.events(id);
      return c.json(events);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 502);
    }
  });

  mountStatic(app, webRoot);
  return app;
}

export function startHttpServer(config: AppConfig): void {
  const app = createApp(config);
  const webRoot = resolveWebRoot();
  serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
    console.log(`[telegram-admin] HTTP 0.0.0.0:${info.port}`);
    console.log(
      `[telegram-admin] static: ${existsSync(path.join(webRoot, "index.html")) ? webRoot : "missing (run build)"}`,
    );
    if (!config.webAppUrl) {
      console.log(
        "[telegram-admin] TELEGRAM_WEBAPP_URL / PUBLIC_URL не задан — Mini App в Telegram не откроется.",
      );
    } else {
      console.log(`[telegram-admin] Mini App URL: ${config.webAppUrl}`);
    }
  });
}
