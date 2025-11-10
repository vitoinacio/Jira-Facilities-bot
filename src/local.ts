import "dotenv/config";
import { buildServer } from "./server.js";

async function main() {
  const app = await buildServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";

  try {
    await app.listen({ port, host });
    console.log(`🚀 Local dev up on http://${host}:${port}`);
    console.log(`   Health: http://${host}:${port}/api/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
