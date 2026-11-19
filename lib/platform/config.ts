import "server-only";

/**
 * Deployment configuration, read once.
 *
 * The rule this file exists to enforce: the application does not decide how much work
 * it may do. Every ceiling below is an operator's number, arriving from the environment,
 * with a documented default. An application-level cap is how a self-hosted install ends
 * up unable to use the machine it was given, so there is no hidden "max 5 tasks" here.
 *
 * Everything is validated at read time and fails loudly. A typo in a numeric variable
 * silently becoming NaN is how a worker ends up claiming nothing and looking healthy.
 */

export type StorageDriverName = "local" | "s3" | "vercel-blob";
export type ModelProviderName = "gateway" | "openai-compatible" | "anthropic" | "google" | "ollama";

export type PlatformConfig = {
  database: {
    url: string;
    tenantUrl: string | null;
    poolSize: number;
    ssl: "require" | "prefer" | "disable";
  };
  worker: {
    id: string;
    /** How many tasks one worker process runs at once. Operator's number. */
    concurrency: number;
    pollIntervalMs: number;
    /** Lease length handed to a claimed execution; renewed by heartbeat. */
    leaseMs: number;
    /** Read-only tool this worker runs when a task does not name one. */
    tool: string;
    shutdownGraceMs: number;
  };
  scheduler: {
    intervalMs: number;
    /** How many tasks one pass may claim. Not a policy limit: a batch size. */
    batchSize: number;
    globalLimit: number;
    perWorkspaceLimit: number;
  };
  storage: {
    driver: StorageDriverName;
    localDir: string;
    publicBaseUrl: string | null;
    s3: { bucket: string; region: string; endpoint: string | null; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean } | null;
  };
  models: {
    provider: ModelProviderName;
    modelId: string;
    apiKey: string | null;
    baseUrl: string | null;
    /** Request timeout. An operator's guard, not a product limit. */
    timeoutMs: number;
  };
  alerts: {
    /** Empty means alerts are derived but never delivered. */
    webhookUrl: string | null;
    cooldownMinutes: number;
  };
  publicUrl: string;
};

function str(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function int(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}, received ${JSON.stringify(raw)}`);
  }
  return value;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}, received ${JSON.stringify(raw)}`);
  }
  return raw as T;
}

/**
 * Merge a self-hosted install's model into the app's understanding of itself. Called
 * from process entrypoints (worker, scheduler, health) rather than at import, so a
 * misconfiguration is reported once, by the thing that needed it, instead of breaking
 * every module that happens to import this file.
 */
export function platformConfig(overrides: Partial<PlatformConfig> = {}): PlatformConfig {
  const databaseUrl = str("DATABASE_URL") || str("POSTGRES_URL");
  if (!databaseUrl && !overrides.database) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) must be set");
  }

  const storageDriver = oneOf<StorageDriverName>("STORAGE_DRIVER", ["local", "s3", "vercel-blob"], "local");
  const s3Configured = storageDriver === "s3";

  return {
    database: {
      url: databaseUrl,
      tenantUrl: str("DATABASE_URL_TENANT") || null,
      poolSize: int("DATABASE_POOL_SIZE", 10),
      ssl: oneOf<"require" | "prefer" | "disable">("DATABASE_SSL", ["require", "prefer", "disable"], "prefer"),
    },
    worker: {
      // A container hostname is a stable, unique worker identity for free; a random one
      // would change on every restart and make lease forensics useless.
      id: str("WORKER_ID") || str("HOSTNAME") || `worker-${process.pid}`,
      concurrency: int("WORKER_CONCURRENCY", 1),
      pollIntervalMs: int("WORKER_POLL_INTERVAL_MS", 5000),
      leaseMs: int("WORKER_LEASE_MS", 120_000),
      tool: str("WORKER_TOOL", "github_repo_inspect"),
      shutdownGraceMs: int("WORKER_SHUTDOWN_GRACE_MS", 20_000),
    },
    scheduler: {
      intervalMs: int("SCHEDULER_INTERVAL_MS", 30_000),
      batchSize: int("SCHEDULER_BATCH_SIZE", 10),
      globalLimit: int("SCHEDULER_GLOBAL_LIMIT", 10),
      perWorkspaceLimit: int("SCHEDULER_PER_WORKSPACE_LIMIT", 5),
    },
    storage: {
      driver: storageDriver,
      localDir: str("STORAGE_LOCAL_DIR", "/data/storage"),
      publicBaseUrl: str("STORAGE_PUBLIC_BASE_URL") || null,
      s3: s3Configured
        ? {
            bucket: required("S3_BUCKET"),
            region: str("S3_REGION", "us-east-1"),
            endpoint: str("S3_ENDPOINT") || null,
            accessKeyId: required("S3_ACCESS_KEY_ID"),
            secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
            // MinIO and most self-hosted object stores need path-style addressing.
            forcePathStyle: str("S3_FORCE_PATH_STYLE", "true") !== "false",
          }
        : null,
    },
    models: {
      provider: oneOf<ModelProviderName>(
        "MODEL_PROVIDER",
        ["gateway", "openai-compatible", "anthropic", "google", "ollama"],
        "gateway"
      ),
      modelId: str("MODEL_ID", "google/gemini-2.5-flash-lite"),
      apiKey: str("MODEL_API_KEY") || null,
      baseUrl: str("MODEL_BASE_URL") || null,
      timeoutMs: int("MODEL_TIMEOUT_MS", 60_000),
    },
    alerts: {
      webhookUrl: str("ALERT_WEBHOOK_URL") || null,
      cooldownMinutes: int("ALERT_COOLDOWN_MINUTES", 60),
    },
    publicUrl: str("PUBLIC_URL", "http://localhost:3000"),
    ...overrides,
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when STORAGE_DRIVER=s3`);
  return value;
}

/** Per-service config for a container that only does one job. */
export function workerConfig() {
  const config = platformConfig();
  return { database: config.database, worker: config.worker, models: config.models, alerts: config.alerts, publicUrl: config.publicUrl };
}

export function schedulerConfig() {
  const config = platformConfig();
  return { database: config.database, scheduler: config.scheduler, alerts: config.alerts, publicUrl: config.publicUrl };
}
