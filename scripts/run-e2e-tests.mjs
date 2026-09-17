#!/usr/bin/env node
// Runs the HTTP test suites against a throwaway development server.
//
// The API and billing suites need real Cloudflare bindings, so they cannot run without a
// server. This orchestrator applies migrations, starts `next dev` on its own port, waits
// for readiness, runs both suites, cleans up test data, and always shuts the server down.
//
// Usage: npm run test:e2e
//
// Do not run `npm run build` or `npm run cf:build` while this is running. Both write to
// `.next` and will invalidate the development server's chunks.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, sep } from "node:path";

const DEV_VARS = ".dev.vars";
const READY_TIMEOUT_MS = 120_000;
/** Per-route ceiling for on-demand compilation before the suites are allowed to start. */
const WARMUP_TIMEOUT_MS = 60_000;

/** Local-only placeholders. Nothing here is a real credential. */
const TEST_DEFAULTS = {
  ADMIN_TASK_TOKEN: "e2e_admin_task_token_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_placeholder_secret",
  STRIPE_PRICE_FOUNDING_MONTHLY: "price_e2e_monthly",
  STRIPE_PRICE_FOUNDING_ANNUAL: "price_e2e_annual",
};

function log(message) {
  console.log(`\n=== ${message}`);
}

function parseDevVars(contents) {
  const values = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return values;
}

/**
 * Ensures the worker environment has the values the suites need.
 *
 * An existing `.dev.vars` is never modified or overwritten; its values are read and reused.
 * A file created here is removed again on exit.
 */
function prepareEnvironment() {
  if (existsSync(DEV_VARS)) {
    const existing = parseDevVars(readFileSync(DEV_VARS, "utf8"));
    const missing = Object.keys(TEST_DEFAULTS).filter((key) => !existing[key]);
    if (missing.length) {
      console.error(
        `\n${DEV_VARS} exists but is missing: ${missing.join(", ")}.\n` +
          "Add them yourself, or move the file aside to let this script create a temporary one.",
      );
      process.exit(2);
    }
    return { values: existing, createdDevVars: false };
  }

  const contents = Object.entries(TEST_DEFAULTS)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeFileSync(DEV_VARS, `# Created by scripts/run-e2e-tests.mjs. Deleted when it exits.\n${contents}\n`);
  return { values: { ...TEST_DEFAULTS }, createdDevVars: true };
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false, ...options });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

async function findFreePort(start = 3210) {
  for (let port = start; port < start + 40; port += 1) {
    const free = await new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  throw new Error("No free port available for the test server.");
}

async function waitForReady(baseUrl) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/entitlements`);
      if (response.ok) return true;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Requests every API route once so the development server compiles all of them up front.
 *
 * This is not an optimisation. The development server compiles routes on demand, and a request
 * for a route it has not compiled yet does not wait for compilation: it falls through to the App
 * Router, which answers 404 with an HTML not-found page. So the first test to touch any given
 * route can fail for no reason other than being first.
 *
 * That failure mode is unpleasant to diagnose because it depends on state outside the repository.
 * A machine that has run `npm run dev` has a warm `.next` and passes, while a fresh checkout and
 * a CI runner fail on whichever route the suites happen to reach first. The deployed site is never
 * affected, because a production build compiles everything ahead of time, so the deployment smoke
 * test passes while the local suite fails.
 *
 * Routes are discovered from the filesystem rather than listed here, so a new endpoint is covered
 * without anyone remembering to add it. Dynamic segments get a placeholder; the responses are
 * irrelevant and are deliberately ignored, since compiling the route is the entire point.
 */
async function warmUpApiRoutes(baseUrl) {
  const apiRoot = join(process.cwd(), "src", "app", "api");
  const urls = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
        const segments = relative(apiRoot, dir).split(sep).filter(Boolean);
        // `[token]` and `[...rest]` alike become something harmless and clearly not real.
        const path = segments.map((s) => (s.startsWith("[") ? "warmup" : s)).join("/");
        urls.push(`${baseUrl}/api/${path}`);
      }
    }
  };

  try {
    walk(apiRoot);
  } catch {
    return { total: 0, unready: [] };
  }

  /**
   * An uncompiled route is distinguishable from a route that simply refuses the request. Our
   * handlers always answer with JSON, so a 404 carrying HTML is the App Router's not-found page,
   * which is what a request for a route that does not exist yet receives.
   */
  const stillCompiling = async (url) => {
    try {
      const response = await fetch(url);
      return response.status === 404 && (response.headers.get("content-type") || "").includes("text/html");
    } catch {
      return true;
    }
  };

  // Sequential on purpose. Firing every route at once asks the development server to compile
  // twenty-odd entry points simultaneously, which is how this problem was made worse rather
  // than better on the first attempt at fixing it.
  const unready = [];
  for (const url of urls) {
    const deadline = Date.now() + WARMUP_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      if (!(await stillCompiling(url))) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) unready.push(url.replace(baseUrl, ""));
  }
  return { total: urls.length, unready };
}

/** Stops the server and waits for it to actually exit, so nothing is still writing. */
function stopDevServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = setTimeout(resolve, 10_000);
    child.once("exit", () => {
      clearTimeout(done);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

/**
 * Removes Next's generated dev types.
 *
 * Stopping the dev server can leave `.next/dev/types` half-written, which then fails
 * `tsc --noEmit` with errors that look like they come from application code. The directory
 * is generated, so removing it is always safe, and a failure here must never fail the run.
 */
function discardGeneratedDevTypes() {
  try {
    rmSync(".next/dev", { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // A residual race is harmless; the next build regenerates the directory.
  }
}

async function main() {
  const { values, createdDevVars } = prepareEnvironment();
  let devServer = null;

  /** Last-resort cleanup. Must stay synchronous and must never throw. */
  const cleanup = () => {
    if (devServer && !devServer.killed) devServer.kill("SIGTERM");
    if (createdDevVars && existsSync(DEV_VARS)) unlinkSync(DEV_VARS);
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  log("Applying local D1 migrations");
  const migrated = await run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local"]);
  if (migrated !== 0) {
    console.error("Local migrations failed.");
    process.exit(1);
  }

  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  log(`Starting the test server on ${baseUrl}`);
  devServer = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  devServer.stdout.on("data", () => {});
  devServer.stderr.on("data", (chunk) => process.stderr.write(chunk));

  if (!(await waitForReady(baseUrl))) {
    console.error("The test server did not become ready in time.");
    process.exit(1);
  }
  const warmup = await warmUpApiRoutes(baseUrl);
  if (warmup.unready.length > 0) {
    // Failing here names the cause. Letting the suites run would instead surface it as an
    // unrelated-looking 404 inside whichever test happened to touch the route first.
    console.error(
      `These API routes never finished compiling, so the suites would fail for the wrong reason:\n  ${warmup.unready.join("\n  ")}`,
    );
    process.exit(1);
  }
  log(`Compiled ${warmup.total} API routes before running the suites`);

  const childEnv = {
    ...process.env,
    ADMIN_TASK_TOKEN: values.ADMIN_TASK_TOKEN,
    STRIPE_WEBHOOK_SECRET: values.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_FOUNDING_MONTHLY: values.STRIPE_PRICE_FOUNDING_MONTHLY,
    STRIPE_PRICE_FOUNDING_ANNUAL: values.STRIPE_PRICE_FOUNDING_ANNUAL,
  };

  log("API, privacy, and entitlement suite");
  const apiResult = await run("node", ["scripts/api-entitlement-tests.mjs", baseUrl], { env: childEnv });

  log("Billing suite");
  const billingResult = await run("node", ["scripts/api-billing-tests.mjs", baseUrl], { env: childEnv });

  log("Export and account deletion suite");
  const accountResult = await run("node", ["scripts/api-account-data-tests.mjs", baseUrl], { env: childEnv });

  log("Sharing and revocation suite");
  const sharingResult = await run("node", ["scripts/api-sharing-tests.mjs", baseUrl], { env: childEnv });

  log("Removing test data");
  await run("npx", ["wrangler", "d1", "execute", "DB", "--local", "--file=scripts/qa-cleanup.sql"], {
    stdio: "ignore",
  });

  // The server has to be fully stopped before the generated directory is removed. Deleting
  // it while the server is still writing races and fails with ENOTEMPTY.
  await stopDevServer(devServer);
  devServer = null;
  discardGeneratedDevTypes();

  const allPassed =
    apiResult === 0 && billingResult === 0 && accountResult === 0 && sharingResult === 0;
  log(allPassed ? "All HTTP suites passed" : "Failures reported above");
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("\nTest orchestration failed:", error);
  process.exit(1);
});
