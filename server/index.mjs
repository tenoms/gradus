import { createApp } from "./app.mjs";
import { readRuntimeConfig } from "./infrastructure/runtime-config.mjs";
const runtimeConfig = readRuntimeConfig();
const { port, host } = runtimeConfig.http;
const app = await createApp({ runtimeConfig });
const server = app.listen(port, host, () =>
  console.log(`Study Web API: http://${host.includes(":") ? `[${host}]` : host}:${server.address().port}`),
);
const stop = () => server.close(async () => {
  await app.locals.close();
  process.exit(0);
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
