import { createApp } from "./app.mjs";
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "127.0.0.1";
const server = createApp().listen(port, host, () =>
  console.log(`Study Web API: http://${host}:${port}`),
);
const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
