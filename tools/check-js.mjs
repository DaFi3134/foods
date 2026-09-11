import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const targets = [join(root, "docs", "js"), join(root, "tools"), join(root, "tests")];
const files = [];

function walk(directory) {
  try {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      if (stat.isFile() && /\.(?:js|mjs|cjs)$/.test(name)) files.push(path);
    }
  } catch (_) {
    // A patch archive does not contain every original repository directory.
  }
}

targets.forEach(walk);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    console.error(`FAIL ${relative(root, file)}`);
    console.error(result.stderr || result.stdout);
  } else {
    console.log(`OK   ${relative(root, file)}`);
  }
}

if (failed) process.exit(1);
