// Serves the production build exactly as the Docker image does (`output: "standalone"`).
// `next start` is not supported with that output mode, so this copies the static assets next to
// the standalone server (the Dockerfile does the same) and runs it.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) {
  console.error("No standalone build found. Run `pnpm build` first.");
  process.exit(1);
}
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

const child = spawn(process.execPath, [join(standalone, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT ?? "3000", HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1" },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
