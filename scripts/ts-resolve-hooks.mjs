// Module resolution hooks for the unit test runners.
//
// Node's built-in type stripping runs TypeScript directly, but it does not understand the
// project's `@/` path alias or extensionless imports. These hooks add both so any module
// under `src/` can be unit tested without a bundler or a build step.
//
// Test-harness only. Nothing in the application depends on this file.

import { existsSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

function firstExisting(baseUrl) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = new URL(`${baseUrl.href}${suffix}`);
    if (existsSync(candidate)) return candidate.href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // `@/x` maps to `<root>/src/x`, matching tsconfig `paths`.
  if (specifier.startsWith("@/")) {
    const resolved = firstExisting(new URL(`src/${specifier.slice(2)}`, ROOT));
    if (resolved) return nextResolve(resolved, context);
  }

  // Extensionless relative imports inside the project, such as `./crypto`.
  if (specifier.startsWith(".") && context.parentURL?.startsWith(ROOT.href)) {
    const resolved = firstExisting(new URL(specifier, context.parentURL));
    if (resolved) return nextResolve(resolved, context);
  }

  return nextResolve(specifier, context);
}
