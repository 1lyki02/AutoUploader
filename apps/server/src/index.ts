import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "127.0.0.1";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

app.listen({ port: PORT, host: HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
