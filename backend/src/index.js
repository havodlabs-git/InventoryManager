require("dotenv").config();

const { createApp } = require("./app");
const { waitForDb, initDb } = require("./db");
const { startAutoSyncScheduler } = require("./services/r7service");

const PORT = Number(process.env.PORT || 3000);

async function main() {
  console.log("[INIT] Aguardando inicialização da base de dados PostgreSQL...");
  await waitForDb({ maxAttempts: 60, delayMs: 1000 });

  // Criar tabelas e índices
  console.log("[INIT] Executando migrações e inicializações de tabelas...");
  await initDb();

  // Iniciar agendador de sincronização automática
  startAutoSyncScheduler();

  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`==========================================================`);
    console.log(`  Rapid7 Inventory Manager Backend running on port ${PORT}`);
    console.log(`  Health Check URL: http://localhost:${PORT}/api/health`);
    console.log(`==========================================================`);
  });

  server.keepAliveTimeout = 120000;
  server.headersTimeout = 120000;
}

main().catch((err) => {
  console.error("[FATAL] Erro ao iniciar servidor backend:", err);
  process.exit(1);
});
