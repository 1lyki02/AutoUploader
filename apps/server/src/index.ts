import Fastify from "fastify";
import { ZodError } from "zod";
import { registerApi } from "./api.js";
import { loadConfig } from "./config.js";
import { createDatabase, migrateDatabase } from "./db.js";
import { ObjectStorage } from "./storage.js";
import { UploadWorker } from "./worker.js";

const app = Fastify({ logger: true });
const config = loadConfig();
const db = createDatabase(config);
const storage = new ObjectStorage(config);
const worker = new UploadWorker(config, db, storage);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: "Invalid request", issues: error.issues });
  }
  app.log.error(error);
  const normalized = error instanceof Error ? error : new Error(String(error));
  return reply.code((error as { statusCode?: number }).statusCode ?? 500).send({
    error: normalized.message || "Internal server error",
  });
});

async function shutdown(): Promise<void> {
  worker.stop();
  await app.close();
  await db.end({ timeout: 5 });
}

async function main(): Promise<void> {
  await migrateDatabase(db, config);
  await registerApi(app, { config, db, storage });
  await app.listen({ port: config.PORT, host: config.HOST });
  if (config.WORKER_ENABLED) worker.start();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

main().catch((error) => {
  app.log.error(error);
  process.exitCode = 1;
  void db.end({ timeout: 5 });
});
