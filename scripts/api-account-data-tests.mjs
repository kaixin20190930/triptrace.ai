#!/usr/bin/env node
// Automated tests for data export and complete account deletion (M3-007, M3-008).
//
// These are compliance-facing behaviours, so they are tested as rights rather than as
// features: export must work on the free plan, deletion must actually remove data, and
// neither may reach across accounts.
//
// Usage:
//   1. npm run dev
//   2. node scripts/api-account-data-tests.mjs [baseUrl]
//
// Creates its own qa-*@example.invalid accounts and deletes them as part of the run.

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const BASE_URL = (args.find((arg) => arg.startsWith("http")) || process.env.BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

let failures = 0;
let total = 0;

function check(name, passed, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

function createClient() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async fetch(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (cookie) headers.set("Cookie", cookie);
      const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
      for (const raw of response.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(";");
        const [name, value] = pair.split("=");
        if (name?.trim() === "tt_session") cookie = value ? `tt_session=${value}` : "";
      }
      return response;
    },
  };
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const PASSWORD = "QaExport!9xA";

async function signUp(client, tag) {
  const email = `qa-account-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const response = await client.fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, displayName: `QA ${tag}` }),
  });
  const body = await json(response);
  if (!response.ok) throw new Error(`signup failed: ${response.status} ${JSON.stringify(body)}`);
  return { email, userId: body?.user?.id };
}

async function createTrace(client, overrides = {}) {
  const response = await client.fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "QA export trace",
      story: "A placeholder story written by the automated export test.",
      place: "QA Place",
      mood: "calm",
      tags: ["qa", "export"],
      photoKeys: [],
      isPublic: false,
      eventAt: "2026-03-04",
      datePrecision: "day",
      factualSummary: "Factual note for the export test.",
      people: ["QA Person"],
      latitude: 41.15,
      longitude: -8.61,
      factsConfirmed: true,
      ai: { source: "mock", model: null },
      ...overrides,
    }),
  });
  return { response, body: await json(response) };
}

/** 1x1 PNG, enough to prove real bytes travel into the archive. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function uploadPhoto(client, name) {
  const form = new FormData();
  form.append("photos", new Blob([TINY_PNG], { type: "image/png" }), name);
  const response = await client.fetch("/api/media", { method: "POST", body: form });
  const body = await json(response);
  return body?.files?.[0]?.key || null;
}

function d1(sql) {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["wrangler", "d1", "execute", "triptrace", "--local", "--command", sql, "--json"],
      { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve(null);
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed?.[0]?.results ?? []);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

async function run() {
  console.log(`Running account data tests against ${BASE_URL}\n`);
  const probe = await fetch(`${BASE_URL}/api/entitlements`).catch(() => null);
  if (!probe) {
    console.error(`Cannot reach ${BASE_URL}. Start \`npm run dev\` first.`);
    process.exit(2);
  }

  const guest = createClient();
  const owner = createClient();
  const other = createClient();

  // ---------------------------------------------------------------- access control
  for (const path of ["/api/export", "/api/export/archive"]) {
    const denied = await guest.fetch(path);
    check(`${path} requires an account`, denied.status === 401, `status=${denied.status}`);
  }
  const guestDelete = await guest.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "whatever" }),
  });
  check("account deletion requires an account", guestDelete.status === 401, `status=${guestDelete.status}`);

  // ---------------------------------------------------------------- export contents
  const account = await signUp(owner, "owner");
  const traceOne = await createTrace(owner, { title: "QA export trace one" });
  const photoKey = await uploadPhoto(owner, "export-fixture.png");
  const traceTwo = await createTrace(owner, {
    title: "QA export trace two",
    photoKeys: photoKey ? [photoKey] : [],
  });
  check(
    "fixtures for the export were created",
    traceOne.response.status === 201 && traceTwo.response.status === 201 && Boolean(photoKey),
    `photo=${Boolean(photoKey)}`,
  );

  const exportResponse = await owner.fetch("/api/export");
  const exported = await json(exportResponse);
  check(
    "the free plan can export, because taking your own data is not a paid feature",
    exportResponse.status === 200,
    `status=${exportResponse.status}`,
  );
  check(
    "the export is served as a downloadable file",
    (exportResponse.headers.get("content-disposition") || "").includes("attachment"),
    exportResponse.headers.get("content-disposition") || "",
  );
  check(
    "the export declares a format version so it can be read years later",
    exported?.formatVersion === 1 && typeof exported?.exportedAt === "string",
  );
  check(
    "the export explains its own structure",
    Array.isArray(exported?.readme) && exported.readme.length >= 5,
    `${exported?.readme?.length} lines`,
  );
  check(
    "the export contains the account identity",
    exported?.account?.email === account.email && exported?.account?.id === account.userId,
  );
  check("the export contains every trace", exported?.traces?.length === 2, `${exported?.traces?.length}`);

  const exportedTrace = (exported?.traces || []).find((trace) => trace.title === "QA export trace two");
  check(
    "a trace keeps the confirmed facts separate from the AI narrative",
    exportedTrace?.eventAt?.startsWith("2026-03-04") &&
      exportedTrace?.factualSummary === "Factual note for the export test." &&
      exportedTrace?.latitude === 41.15 &&
      Array.isArray(exportedTrace?.people) &&
      typeof exportedTrace?.story === "string" &&
      Array.isArray(exportedTrace?.tags),
    JSON.stringify({ eventAt: exportedTrace?.eventAt, lat: exportedTrace?.latitude }),
  );
  check(
    "a trace records which model drafted it, so AI authorship stays attributable",
    exportedTrace?.ai?.source === "mock" && "model" in (exportedTrace?.ai || {}) &&
      "generatedAt" in (exportedTrace?.ai || {}),
    JSON.stringify(exportedTrace?.ai),
  );
  check(
    "the export lists media with both a url and an archive path",
    exported?.media?.length === 1 &&
      typeof exported.media[0].url === "string" &&
      typeof exported.media[0].archivePath === "string",
    JSON.stringify(exported?.media?.[0] || {}),
  );
  check(
    "the export includes the plan and usage the account actually has",
    exported?.plan?.key === "free" && Array.isArray(exported?.usage),
    `plan=${exported?.plan?.key}`,
  );
  check(
    "the export includes the account's own activity history",
    Array.isArray(exported?.activity),
    `${exported?.activity?.length} rows`,
  );
  check(
    "the export never contains a password hash",
    !JSON.stringify(exported).toLowerCase().includes("pbkdf2"),
  );

  // ---------------------------------------------------------------- archive
  const archiveResponse = await owner.fetch("/api/export/archive");
  check(
    "the archive is returned as a zip attachment",
    archiveResponse.status === 200 &&
      (archiveResponse.headers.get("content-type") || "").includes("zip"),
    `status=${archiveResponse.status} type=${archiveResponse.headers.get("content-type")}`,
  );

  const dir = mkdtempSync(join(tmpdir(), "triptrace-export-"));
  try {
    const archiveBytes = Buffer.from(await archiveResponse.arrayBuffer());
    const archivePath = join(dir, "atlas.zip");
    writeFileSync(archivePath, archiveBytes);

    let integrity = "";
    let integrityOk = true;
    try {
      integrity = execFileSync("unzip", ["-t", archivePath], { encoding: "utf8" });
    } catch (error) {
      integrityOk = false;
      integrity = String(error);
    }
    check(
      "the downloaded archive passes a real integrity check",
      integrityOk && /No errors detected/i.test(integrity),
      integrity.split("\n").filter(Boolean).slice(-1)[0] || "",
    );

    const listing = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    check("the archive contains the manifest", listing.includes("manifest.json"), listing.join(","));
    check(
      "the archive contains the photo file itself, which is what makes it portable",
      listing.some((entry) => entry.startsWith("media/")),
      listing.join(","),
    );
    check(
      "the archive path in the manifest matches the entry in the archive",
      listing.includes(exported.media[0].archivePath),
      `${exported.media[0].archivePath}`,
    );

    execFileSync("unzip", ["-q", "-o", archivePath, "-d", join(dir, "out")]);
    const extracted = execFileSync("cat", [join(dir, "out", "manifest.json")], { encoding: "utf8" });
    const manifest = JSON.parse(extracted);
    check(
      "the extracted manifest holds the same traces as the JSON export",
      manifest.traces.length === 2,
      `${manifest.traces.length}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- cross-account
  const otherAccount = await signUp(other, "other");
  const otherExport = await json(await other.fetch("/api/export"));
  check(
    "an export never reaches into another account",
    otherExport?.traces?.length === 0 && otherExport?.account?.email === otherAccount.email,
    `${otherExport?.traces?.length} traces`,
  );

  // ---------------------------------------------------------------- deletion guards
  const noPassword = await other.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const noPasswordBody = await json(noPassword);
  check(
    "deletion refuses without a password",
    noPassword.status === 400 && noPasswordBody?.error?.code === "password_required",
    `status=${noPassword.status} code=${noPasswordBody?.error?.code}`,
  );

  const wrongPassword = await other.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "not-the-password" }),
  });
  const wrongPasswordBody = await json(wrongPassword);
  check(
    "a valid session alone cannot delete an account",
    wrongPassword.status === 403 && wrongPasswordBody?.error?.code === "password_incorrect",
    `status=${wrongPassword.status} code=${wrongPasswordBody?.error?.code}`,
  );

  const stillThere = await other.fetch("/api/export");
  check("a refused deletion leaves the account intact", stillThere.status === 200, `status=${stillThere.status}`);

  // A live paid subscription must block deletion so nobody is billed for a deleted account.
  await d1(
    `INSERT OR REPLACE INTO subscriptions (id,user_id,provider,plan_key,status,current_period_end,cancel_at_period_end,created_at,updated_at)
     VALUES ('sub_qa_delete','${otherAccount.userId}','stripe','founding_plus','active','2030-01-01T00:00:00.000Z',0,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');`,
  );
  const subscribedDelete = await other.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const subscribedBody = await json(subscribedDelete);
  check(
    "deletion is refused while a paid subscription is live",
    subscribedDelete.status === 409 &&
      subscribedBody?.error?.code === "account_has_active_subscription",
    `status=${subscribedDelete.status} code=${subscribedBody?.error?.code}`,
  );
  await d1(`DELETE FROM subscriptions WHERE id = 'sub_qa_delete';`);

  const cancelledDelete = await other.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  check(
    "deletion proceeds once no paid subscription is live",
    cancelledDelete.status === 200,
    `status=${cancelledDelete.status}`,
  );

  // ---------------------------------------------------------------- deletion effects
  const ownerDelete = await owner.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const ownerDeleteBody = await json(ownerDelete);
  check(
    "the owner account is deleted and reports what was removed",
    ownerDelete.status === 200 && ownerDeleteBody?.deleted?.traces === 2,
    `status=${ownerDelete.status} ${JSON.stringify(ownerDeleteBody?.deleted)}`,
  );
  // A 404 from the media route only proves authorisation failed, since access is resolved
  // through a referencing trace. Proving the object itself is gone needs the storage count.
  check(
    "deletion actually removed the stored photo, not just its authorisation",
    ownerDeleteBody?.deleted?.mediaDeleted === 1 && ownerDeleteBody?.deleted?.mediaQueued === 0,
    JSON.stringify(ownerDeleteBody?.deleted),
  );
  check(
    "the session cookie is cleared by the deletion response",
    (ownerDelete.headers.getSetCookie?.() || []).some((cookie) =>
      cookie.includes("tt_session=") && /Max-Age=0/.test(cookie),
    ),
    (ownerDelete.headers.getSetCookie?.() || []).join(" | "),
  );

  const afterDelete = await owner.fetch("/api/export");
  check(
    "the deleted account can no longer authenticate",
    afterDelete.status === 401,
    `status=${afterDelete.status}`,
  );

  const signInAgain = await createClient().fetch("/api/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: PASSWORD }),
  });
  check(
    "the deleted account cannot sign in again, so it is gone rather than hidden",
    signInAgain.status >= 400,
    `status=${signInAgain.status}`,
  );

  const mediaAfterDelete = await createClient().fetch(
    `/api/media?key=${encodeURIComponent(photoKey || "missing")}`,
  );
  check(
    "media from a deleted account is no longer readable",
    mediaAfterDelete.status === 404 || mediaAfterDelete.status === 403,
    `status=${mediaAfterDelete.status}`,
  );

  const remaining = await d1(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE id = '${account.userId}') AS users,
       (SELECT COUNT(*) FROM memories WHERE user_id = '${account.userId}') AS memories,
       (SELECT COUNT(*) FROM sessions WHERE user_id = '${account.userId}') AS sessions,
       (SELECT COUNT(*) FROM usage_counters WHERE user_id = '${account.userId}') AS usage,
       (SELECT COUNT(*) FROM subscriptions WHERE user_id = '${account.userId}') AS subs,
       (SELECT COUNT(*) FROM analytics_events WHERE user_id = '${account.userId}') AS events;`,
  );
  const counts = remaining?.[0];
  if (!counts) {
    check("database state after deletion could be inspected", false, "wrangler query failed");
  } else {
    check(
      "no row anywhere still belongs to the deleted account",
      Object.values(counts).every((value) => Number(value) === 0),
      JSON.stringify(counts),
    );
  }

  console.log("");
  console.log(`${total - failures}/${total} checks passed`);
  if (failures > 0) process.exit(1);
}

run().catch((error) => {
  console.error("\nTest run aborted:", error);
  process.exit(1);
});
