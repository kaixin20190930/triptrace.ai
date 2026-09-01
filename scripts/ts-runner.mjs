// Registers the alias and extension resolution hooks used by the unit test runners.
// Loaded with `node --import ./scripts/ts-runner.mjs <test file>`.
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
