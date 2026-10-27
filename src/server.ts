import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\nSeñal ${signal} recibida. Cerrando servidor...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("Conexión con PostgreSQL cerrada.");
      process.exit(0);
    } catch (error) {
      console.error("Error al cerrar Prisma:", error);
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
