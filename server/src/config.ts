import "dotenv/config";

function int(name: string, def: number): number {
  const v = process.env[name];
  return v ? parseInt(v, 10) : def;
}

export const config = {
  port: int("PORT", 4001),
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://ide:ide@localhost:5433/ide",
  sandbox: {
    timeoutMs: int("SANDBOX_TIMEOUT_MS", 10_000),
    memoryMb: int("SANDBOX_MEMORY_MB", 256),
    pidsLimit: int("SANDBOX_PIDS_LIMIT", 64),
    cpu: Number(process.env.SANDBOX_CPU ?? 0.5),
  },
};
