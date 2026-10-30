// Copy the static export (out/) into ../static, where the Python server serves it.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));
const target = fileURLToPath(new URL("../../static", import.meta.url));
rmSync(target, { recursive: true, force: true });
cpSync(out, target, { recursive: true });
console.log("Published the UI to static/");
