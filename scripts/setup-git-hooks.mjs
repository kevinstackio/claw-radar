#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const gitDir = path.join(projectRoot, ".git");

if (!existsSync(gitDir)) {
  console.log("[hooks:install] skip: .git not found (not a Git working tree).");
  process.exit(0);
}

try {
  execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" });
} catch {
  console.log("[hooks:install] skip: not inside a Git working tree.");
  process.exit(0);
}

execSync("git config core.hooksPath .githooks", { stdio: "inherit" });

if (process.platform !== "win32") {
  try {
    execSync("chmod +x .githooks/pre-commit .githooks/pre-push", { stdio: "inherit" });
  } catch {
    // Ignore chmod failures on environments with restricted file permissions.
  }
}

console.log("[hooks:install] done: Git hooks path set to .githooks");
