import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const isWindows = process.platform === "win32";
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
const env = { ...process.env };

if (isWindows) {
  const cargoBin = path.join(process.env.USERPROFILE ?? os.homedir(), ".cargo", "bin");
  const cargoExe = path.join(cargoBin, "cargo.exe");

  // Rustup updates the user PATH, but already-open terminals do not inherit it.
  if (existsSync(cargoExe)) {
    env[pathKey] = [cargoBin, env[pathKey]].filter(Boolean).join(path.delimiter);
  }
}

const tauriBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  isWindows ? "tauri.cmd" : "tauri",
);
const command = existsSync(tauriBin) ? tauriBin : "tauri";
const child = spawn(command, process.argv.slice(2), {
  env,
  shell: isWindows,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Failed to start Tauri CLI: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
