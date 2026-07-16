import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const HOST = "127.0.0.1";
const MAX_CONNECTIONS = 20;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = resolve(projectRoot, "node_modules/vitest/vitest.mjs");
const vitestConfig = resolve(projectRoot, "vitest.postgres.config.mts");

function databaseUrlFor(server: PGLiteSocketServer): string {
  const endpoint = server.getServerConn();
  const port = Number(endpoint.slice(endpoint.lastIndexOf(":") + 1));

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PGlite did not provide a valid listening port: ${endpoint}`);
  }

  return `postgresql://postgres:postgres@${HOST}:${port}/postgres?sslmode=disable`;
}

function runVitest(testDatabaseUrl: string): Promise<number> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [
        vitestCli,
        "run",
        ...process.argv.slice(2),
        "--config",
        vitestConfig,
      ],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          PGSSLMODE: "disable",
          TEST_DATABASE_ENGINE: "pglite",
          TEST_DATABASE_URL: testDatabaseUrl,
        },
        stdio: "inherit",
      },
    );

    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    const signalHandlers = new Map(
      signals.map((signal) => [
        signal,
        () => {
          child.kill(signal);
        },
      ]),
    );

    for (const signal of signals) {
      const handler = signalHandlers.get(signal);

      if (handler) {
        process.once(signal, handler);
      }
    }

    const removeSignalHandlers = () => {
      for (const signal of signals) {
        const handler = signalHandlers.get(signal);

        if (handler) {
          process.removeListener(signal, handler);
        }
      }
    };

    child.once("error", (error) => {
      removeSignalHandlers();
      rejectRun(error);
    });

    child.once("close", (code, signal) => {
      removeSignalHandlers();

      if (signal) {
        console.error(`PostgreSQL tests terminated by ${signal}.`);
        resolveRun(1);
        return;
      }

      resolveRun(code ?? 1);
    });
  });
}

async function main() {
  const database = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: database,
    host: HOST,
    maxConnections: MAX_CONNECTIONS,
    port: 0,
  });

  try {
    await server.start();
    const exitCode = await runVitest(databaseUrlFor(server));
    process.exitCode = exitCode;
  } finally {
    try {
      await server.stop();
    } finally {
      await database.close();
    }
  }
}

main().catch((error: unknown) => {
  console.error("Unable to run PostgreSQL integration tests.", error);
  process.exitCode = 1;
});
