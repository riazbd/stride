// Project-local PostgreSQL: a private cluster in .pgdata/ on localhost:5433,
// run as the current user from an existing PostgreSQL install. Leaves any
// system PostgreSQL service and its passwords untouched.
//
//   bun scripts/pg.ts start   — first run: initdb + create db + write DATABASE_URL to .env
//   bun scripts/pg.ts stop
//   bun scripts/pg.ts status
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = resolve(import.meta.dir, "..");
const DATA = join(ROOT, ".pgdata");
const LOG = join(DATA, "server.log");
const PORT = Number(process.env.STRIDE_PG_PORT ?? 5433);
const USER = "stride";
const DB = "stride";
const exe = process.platform === "win32" ? ".exe" : "";

// PG_BIN wins; then PATH; then the usual install locations (newest version first)
function findBin(): string {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  if (spawnSync(`pg_ctl${exe}`, ["--version"]).status === 0) return "";
  const roots = process.platform === "win32"
    ? ["C:\\Program Files\\PostgreSQL"]
    : ["/usr/lib/postgresql", "/opt/homebrew/opt", "/usr/local/opt"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root).sort((a, b) => parseFloat(b.replace(/\D+/, "")) - parseFloat(a.replace(/\D+/, "")));
    for (const v of versions) {
      const bin = join(root, v, "bin");
      if (existsSync(join(bin, `pg_ctl${exe}`))) return bin;
    }
  }
  throw new Error("PostgreSQL binaries not found — install PostgreSQL or set PG_BIN to its bin directory");
}
const BIN = findBin();
const tool = (name: string) => (BIN ? join(BIN, name + exe) : name + exe);

function run(name: string, args: string[], env: Record<string, string> = {}, quiet = false) {
  // the server outlives pg_ctl and would inherit our stdout — keep it detached so
  // `pg:start | something` (or CI) doesn't hang waiting for EOF
  const r = spawnSync(tool(name), args, { stdio: quiet ? "ignore" : "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${name} exited with ${r.status}${quiet ? ` — see ${LOG}` : ""}`);
}

const running = () => existsSync(DATA) && spawnSync(tool("pg_ctl"), ["status", "-D", DATA]).status === 0;

function upsertEnv(url: string) {
  const file = join(ROOT, ".env");
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("DATABASE_URL=")) : [];
  lines.unshift(`DATABASE_URL="${url}"`);
  writeFileSync(file, lines.join("\n") + "\n");
}

function init() {
  const password = randomBytes(18).toString("hex");
  const pwfile = join(ROOT, ".pgpw.tmp");
  writeFileSync(pwfile, password + "\n");
  try {
    run("initdb", ["-D", DATA, "-U", USER, `--pwfile=${pwfile}`, "--auth=scram-sha-256", "-E", "UTF8", "--locale=C"]);
  } finally {
    unlinkSync(pwfile);
  }
  start();
  run("createdb", ["-h", "localhost", "-p", String(PORT), "-U", USER, DB], { PGPASSWORD: password });
  upsertEnv(`postgresql://${USER}:${password}@localhost:${PORT}/${DB}`);
  console.log(`Created database "${DB}" on localhost:${PORT}; DATABASE_URL written to .env`);
}

function start() {
  if (running()) return console.log(`PostgreSQL already running on localhost:${PORT}`);
  run("pg_ctl", ["start", "-D", DATA, "-l", LOG, "-w", "-o", `-p ${PORT} -c listen_addresses=localhost`], {}, true);
  console.log(`PostgreSQL running on localhost:${PORT}`);
}

const cmd = process.argv[2] ?? "start";
if (cmd === "start") {
  if (existsSync(DATA)) start();
  else init();
} else if (cmd === "stop") {
  if (running()) run("pg_ctl", ["stop", "-D", DATA, "-m", "fast"]);
  else console.log("PostgreSQL is not running");
} else if (cmd === "status") console.log(running() ? `running on localhost:${PORT} (${DATA})` : "stopped");
else throw new Error(`unknown command "${cmd}" — use start, stop or status`);
