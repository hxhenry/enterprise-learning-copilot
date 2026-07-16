import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPENAI_EMBEDDING_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PERSISTENCE_BACKEND,
  DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
  DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
  DEFAULT_POSTGRES_POOL_MAX,
  DEFAULT_POSTGRES_SCHEMA,
  DEFAULT_POSTGRES_STATEMENT_TIMEOUT_MS,
  DEFAULT_POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS,
  DEFAULT_POSTGRES_WORKFLOW_LOCK_POOL_MAX,
  parsePersistenceEnvironment,
  parseServerEnvironment,
  ServerEnvironmentError,
} from "@/lib/config/server-environment";

const PERSISTENCE_DEFAULTS = {
  PERSISTENCE_BACKEND: DEFAULT_PERSISTENCE_BACKEND,
  POSTGRES_SCHEMA: DEFAULT_POSTGRES_SCHEMA,
  POSTGRES_POOL_MAX: DEFAULT_POSTGRES_POOL_MAX,
  POSTGRES_WORKFLOW_LOCK_POOL_MAX:
    DEFAULT_POSTGRES_WORKFLOW_LOCK_POOL_MAX,
  POSTGRES_CONNECTION_TIMEOUT_MS:
    DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
  POSTGRES_IDLE_TIMEOUT_MS: DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
  POSTGRES_STATEMENT_TIMEOUT_MS:
    DEFAULT_POSTGRES_STATEMENT_TIMEOUT_MS,
  POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS:
    DEFAULT_POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS,
};

describe("server environment", () => {
  it("parses persistence settings without model credentials", () => {
    expect(
      parsePersistenceEnvironment({
        PERSISTENCE_BACKEND: "postgres",
        DATABASE_URL: "postgresql://learning:secret@localhost/learning",
      }),
    ).toEqual({
      ...PERSISTENCE_DEFAULTS,
      PERSISTENCE_BACKEND: "postgres",
      DATABASE_URL:
        "postgresql://learning:secret@localhost/learning",
    });
  });

  it("applies model defaults", () => {
    expect(
      parseServerEnvironment({
        OPENAI_API_KEY: "test-key",
      }),
    ).toEqual({
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
      OPENAI_EMBEDDING_MODEL: DEFAULT_OPENAI_EMBEDDING_MODEL,
      ...PERSISTENCE_DEFAULTS,
    });
  });

  it("trims explicit configuration", () => {
    expect(
      parseServerEnvironment({
        OPENAI_API_KEY: "  test-key  ",
        OPENAI_MODEL: "  test-model  ",
        OPENAI_EMBEDDING_MODEL: "  test-embedding  ",
      }),
    ).toEqual({
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
      OPENAI_EMBEDDING_MODEL: "test-embedding",
      ...PERSISTENCE_DEFAULTS,
    });
  });

  it("normalizes explicit PostgreSQL persistence configuration", () => {
    expect(
      parseServerEnvironment({
        OPENAI_API_KEY: "test-key",
        PERSISTENCE_BACKEND: " postgres ",
        DATABASE_URL:
          " postgresql://learner:secret@localhost:5432/learning ",
        POSTGRES_SCHEMA: " learning_runtime ",
        POSTGRES_POOL_MAX: " 12 ",
        POSTGRES_WORKFLOW_LOCK_POOL_MAX: " 4 ",
        POSTGRES_CONNECTION_TIMEOUT_MS: " 1500 ",
        POSTGRES_IDLE_TIMEOUT_MS: " 20000 ",
        POSTGRES_STATEMENT_TIMEOUT_MS: " 25000 ",
        POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS: " 3000 ",
      }),
    ).toEqual({
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
      OPENAI_EMBEDDING_MODEL: DEFAULT_OPENAI_EMBEDDING_MODEL,
      PERSISTENCE_BACKEND: "postgres",
      DATABASE_URL:
        "postgresql://learner:secret@localhost:5432/learning",
      POSTGRES_SCHEMA: "learning_runtime",
      POSTGRES_POOL_MAX: 12,
      POSTGRES_WORKFLOW_LOCK_POOL_MAX: 4,
      POSTGRES_CONNECTION_TIMEOUT_MS: 1500,
      POSTGRES_IDLE_TIMEOUT_MS: 20000,
      POSTGRES_STATEMENT_TIMEOUT_MS: 25000,
      POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS: 3000,
    });
  });

  it.each([
    {},
    { DATABASE_URL: "https://example.com/learning" },
    { DATABASE_URL: "postgresql://localhost" },
    { DATABASE_URL: "postgresql://localhost/learning#unsafe" },
    {
      DATABASE_URL:
        "postgresql://localhost/learning?options=-c%20search_path%3Dpublic",
    },
    {
      DATABASE_URL:
        "postgresql://localhost/learning?statement_timeout=0",
    },
    {
      DATABASE_URL:
        "postgresql://localhost/learning?sslmode=no-verify",
    },
    {
      DATABASE_URL:
        "postgresql://learner:database-secret@localhost/learning value",
    },
  ])("rejects an absent or unsafe PostgreSQL URL: %o", (configuration) => {
    expect(() =>
      parseServerEnvironment({
        OPENAI_API_KEY: "test-key",
        PERSISTENCE_BACKEND: "postgres",
        ...configuration,
      }),
    ).toThrow(ServerEnvironmentError);

    try {
      parseServerEnvironment({
        OPENAI_API_KEY: "test-key",
        PERSISTENCE_BACKEND: "postgres",
        DATABASE_URL:
          "postgresql://learner:database-secret@localhost/learning value",
      });
    } catch (error) {
      expect(String(error)).not.toContain("database-secret");
    }
  });

  it.each([
    "Public",
    "contains-hyphen",
    "contains space",
    "1starts_with_number",
    "schema;drop_table",
    "a".repeat(64),
  ])("rejects an unsafe PostgreSQL schema: %s", (schema) => {
    expect(() =>
      parseServerEnvironment({
        OPENAI_API_KEY: "test-key",
        POSTGRES_SCHEMA: schema,
      }),
    ).toThrow(ServerEnvironmentError);
  });

  it.each(["1", "101", "not-a-number"])(
    "rejects an invalid PostgreSQL pool size: %s",
    (poolSize) => {
      expect(() =>
        parseServerEnvironment({
          OPENAI_API_KEY: "test-key",
          POSTGRES_POOL_MAX: poolSize,
        }),
      ).toThrow(ServerEnvironmentError);
    },
  );

  it.each(["0", "101", "not-a-number"])(
    "rejects an invalid PostgreSQL workflow-lock pool size: %s",
    (poolSize) => {
      expect(() =>
        parseServerEnvironment({
          OPENAI_API_KEY: "test-key",
          POSTGRES_WORKFLOW_LOCK_POOL_MAX: poolSize,
        }),
      ).toThrow(ServerEnvironmentError);
    },
  );

  it.each(["0", "99", "300001", "not-a-number"])(
    "rejects an invalid workflow lock timeout: %s",
    (timeout) => {
      expect(() =>
        parseServerEnvironment({
          OPENAI_API_KEY: "test-key",
          POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS: timeout,
        }),
      ).toThrow(ServerEnvironmentError);
    },
  );

  it.each([undefined, "", "   "])(
    "rejects a missing API key without exposing secrets: %s",
    (apiKey) => {
      expect(() =>
        parseServerEnvironment({
          OPENAI_API_KEY: apiKey,
        }),
      ).toThrow(ServerEnvironmentError);

      try {
        parseServerEnvironment({
          OPENAI_API_KEY: apiKey,
          OTHER_SECRET: "test-secret",
        });
      } catch (error) {
        expect(String(error)).not.toContain("test-secret");
      }
    },
  );
});
