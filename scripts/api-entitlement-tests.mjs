#!/usr/bin/env node
// Automated API tests for privacy and server-side entitlements.
//
// These run against a local `next dev` server with Cloudflare bindings, because the
// enforcement lives in D1 and R2 and cannot be verified from unit-level mocks.
//
// Usage:
//   1. npm run dev            (leave running; do NOT run `npm run build` at the same time)
//   2. node scripts/api-entitlement-tests.mjs [baseUrl] [--with-ai]
//
// `--with-ai` additionally exercises the metered AI allowance against the real provider.
// It spends one successful generation, so it is opt-in.
//
// The script creates its own throwaway accounts, exercises the limits, and deletes
// everything it created. It never touches pre-existing users or traces.

const args = process.argv.slice(2);
const WITH_AI = args.includes("--with-ai");
/** Optional. When set, the analytics retention dry run is included. */
const ADMIN_TOKEN = process.env.ADMIN_TASK_TOKEN || "";
const BASE_URL = (args.find((arg) => arg.startsWith("http")) || process.env.BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

const results = [];
let failures = 0;

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

function check(name, condition, detail = "") {
  record(name, Boolean(condition), detail);
}

/** Minimal cookie jar so each identity keeps its own session. */
function createClient() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    clear() {
      cookie = "";
    },
    async fetch(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (cookie) headers.set("Cookie", cookie);
      const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
      const setCookie = response.headers.getSetCookie?.() || [];
      for (const raw of setCookie) {
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

function uniqueEmail(tag) {
  return `qa-entitlements-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
}

async function signUp(client, tag) {
  const email = uniqueEmail(tag);
  const password = `Qa!${Math.random().toString(36).slice(2, 12)}A9`;
  const response = await client.fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: `QA ${tag}` }),
  });
  const body = await json(response);
  if (!response.ok) throw new Error(`signup failed for ${tag}: ${response.status} ${JSON.stringify(body)}`);
  return { email, password };
}

function traceBody(overrides = {}) {
  return {
    title: "QA entitlement trace",
    story: "A short factual placeholder story written by the automated entitlement test.",
    place: "QA Place",
    mood: "calm",
    tags: ["qa"],
    photoKeys: [],
    isPublic: false,
    eventAt: "2026-01-01",
    datePrecision: "day",
    factualSummary: "Automated test row.",
    people: [],
    latitude: null,
    longitude: null,
    factsConfirmed: true,
    ai: { source: "mock", model: null },
    ...overrides,
  };
}

async function createTrace(client, overrides = {}) {
  const response = await client.fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(traceBody(overrides)),
  });
  return { response, body: await json(response) };
}

async function deleteTrace(client, memoryId) {
  return client.fetch(`/api/memories?memoryId=${encodeURIComponent(memoryId)}`, { method: "DELETE" });
}

async function listOwnTraces(client) {
  const response = await client.fetch("/api/memories?own=true");
  const body = await json(response);
  return { response, memories: body?.memories || [] };
}

const createdTraceIds = [];

async function run() {
  console.log(`Running entitlement and privacy API tests against ${BASE_URL}\n`);

  const reachable = await fetch(`${BASE_URL}/api/generate-memory`).catch(() => null);
  if (!reachable) {
    console.error(`Cannot reach ${BASE_URL}. Start \`npm run dev\` first.`);
    process.exit(2);
  }

  const guest = createClient();
  const owner = createClient();
  const other = createClient();

  // ---------------------------------------------------------------- guest surface
  const guestEntitlements = await json(await guest.fetch("/api/entitlements?guestId=qa_guest_probe_00000001"));
  check(
    "guest plan resolves to guest with 0 permanent traces",
    guestEntitlements?.plan?.key === "guest" && guestEntitlements?.limits?.permanentTraces === 0,
    JSON.stringify(guestEntitlements?.limits),
  );
  check(
    "guest cannot save permanent traces",
    guestEntitlements?.canSavePermanentTraces === false,
  );

  const guestSave = await createTrace(guest);
  check(
    "guest direct save is rejected with 401 unauthorized",
    guestSave.response.status === 401 && guestSave.body?.error?.code === "unauthorized",
    `status=${guestSave.response.status} code=${guestSave.body?.error?.code}`,
  );

  const guestList = await guest.fetch("/api/memories?own=true");
  check("guest cannot list private traces", guestList.status === 401, `status=${guestList.status}`);

  const guestMedia = await guest.fetch("/api/media?key=users/does-not-exist/x.jpg");
  check(
    "unknown private media key is not readable while signed out",
    guestMedia.status === 404 || guestMedia.status === 403,
    `status=${guestMedia.status}`,
  );

  // ---------------------------------------------------------------- image cap
  const imageCap = guestEntitlements?.limits?.imagesPerTrace ?? 20;
  const overLimitKeys = Array.from({ length: imageCap + 1 }, (_, i) => `users/fake/${i}.jpg`);
  const guestImageProbe = await guest.fetch("/api/generate-memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moment: "image cap probe",
      photoCount: imageCap + 1,
      guestId: "qa_guest_probe_00000002",
    }),
  });
  const guestImageBody = await json(guestImageProbe);
  check(
    "generation rejects a draft declaring more photos than the plan allows",
    guestImageProbe.status === 400 &&
      guestImageBody?.error?.code === "entitlement_image_limit_exceeded",
    `status=${guestImageProbe.status} code=${guestImageBody?.error?.code}`,
  );

  // ---------------------------------------------------------------- owner account
  const ownerAccount = await signUp(owner, "owner");
  const ownerEntitlements = await json(await owner.fetch("/api/entitlements"));
  check(
    "new signed-in user defaults to the free plan",
    ownerEntitlements?.plan?.key === "free",
    `plan=${ownerEntitlements?.plan?.key}`,
  );
  const freeTraceLimit = ownerEntitlements?.limits?.permanentTraces ?? 3;
  const freeGenerationLimit = ownerEntitlements?.limits?.aiGenerations ?? 5;
  check(
    "free plan reports 0 traces used before saving",
    ownerEntitlements?.usage?.permanentTraces?.used === 0,
    JSON.stringify(ownerEntitlements?.usage?.permanentTraces),
  );

  const overLimitSave = await createTrace(owner, { photoKeys: overLimitKeys });
  check(
    "save rejects more photos than the plan allows instead of silently truncating",
    overLimitSave.response.status === 400 &&
      overLimitSave.body?.error?.code === "entitlement_image_limit_exceeded",
    `status=${overLimitSave.response.status} code=${overLimitSave.body?.error?.code}`,
  );

  // A 1x1 PNG is enough: the cap must be refused before any object reaches R2.
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
  const overLimitUpload = new FormData();
  for (let i = 0; i < imageCap + 1; i += 1) {
    overLimitUpload.append("photos", new Blob([tinyPng], { type: "image/png" }), `qa-${i}.png`);
  }
  const uploadResponse = await owner.fetch("/api/media", { method: "POST", body: overLimitUpload });
  const uploadBody = await json(uploadResponse);
  check(
    "media upload refuses a batch over the plan image cap",
    uploadResponse.status === 400 && uploadBody?.error?.code === "entitlement_image_limit_exceeded",
    `status=${uploadResponse.status} code=${uploadBody?.error?.code}`,
  );

  const atLimitUpload = new FormData();
  for (let i = 0; i < imageCap; i += 1) {
    atLimitUpload.append("photos", new Blob([tinyPng], { type: "image/png" }), `qa-ok-${i}.png`);
  }
  const atLimitResponse = await owner.fetch("/api/media", { method: "POST", body: atLimitUpload });
  const atLimitBody = await json(atLimitResponse);
  check(
    "media upload accepts a batch exactly at the plan image cap",
    atLimitResponse.status === 201 && (atLimitBody?.files || []).length === imageCap,
    `status=${atLimitResponse.status} files=${(atLimitBody?.files || []).length}`,
  );
  const uploadedKeys = (atLimitBody?.files || []).map((file) => file.key);
  for (const key of uploadedKeys) {
    await owner.fetch(`/api/media?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  }
  const orphanCheck = uploadedKeys.length
    ? await owner.fetch(`/api/media?key=${encodeURIComponent(uploadedKeys[0])}`)
    : null;
  check(
    "unreferenced uploaded media can be cleaned up by its owner",
    !orphanCheck || orphanCheck.status === 404,
    `status=${orphanCheck?.status}`,
  );

  // Fill the free trace allowance exactly.
  let firstTraceFlagCount = 0;
  for (let i = 0; i < freeTraceLimit; i += 1) {
    const created = await createTrace(owner, { title: `QA entitlement trace ${i + 1}` });
    check(`free plan save ${i + 1}/${freeTraceLimit} returns 201`, created.response.status === 201,
      `status=${created.response.status} code=${created.body?.error?.code || ""}`);
    if (created.body?.memory?.id) createdTraceIds.push(created.body.memory.id);
    if (created.body?.memory?.isFirstTrace) firstTraceFlagCount += 1;
  }
  check(
    "isFirstTrace is reported exactly once per account",
    firstTraceFlagCount === 1,
    `flagged=${firstTraceFlagCount}`,
  );

  const overTraceLimit = await createTrace(owner, { title: "QA entitlement overflow" });
  check(
    "save beyond the plan trace limit is refused with a stable code",
    overTraceLimit.response.status === 403 &&
      overTraceLimit.body?.error?.code === "entitlement_trace_limit_reached",
    `status=${overTraceLimit.response.status} code=${overTraceLimit.body?.error?.code}`,
  );
  check(
    "trace limit refusal carries plan, limit, and remaining for the UI",
    overTraceLimit.body?.entitlement?.planKey === "free" &&
      overTraceLimit.body?.entitlement?.limit === freeTraceLimit &&
      overTraceLimit.body?.entitlement?.remaining === 0,
    JSON.stringify(overTraceLimit.body?.entitlement),
  );
  check(
    "a refused save carries a human-readable message",
    typeof overTraceLimit.body?.error?.message === "string" &&
      overTraceLimit.body.error.message.length > 20,
  );

  const afterLimit = await listOwnTraces(owner);
  check(
    "a refused save does not create a row",
    afterLimit.memories.length === freeTraceLimit,
    `count=${afterLimit.memories.length}`,
  );

  // Concurrency: with the allowance full, parallel saves must all be refused.
  const concurrentRefusals = await Promise.all(
    Array.from({ length: 5 }, () => createTrace(owner, { title: "QA concurrent overflow" })),
  );
  for (const attempt of concurrentRefusals) {
    if (attempt.body?.memory?.id) createdTraceIds.push(attempt.body.memory.id);
  }
  check(
    "concurrent saves cannot exceed a full trace allowance",
    concurrentRefusals.every((attempt) => attempt.response.status === 403),
    concurrentRefusals.map((attempt) => attempt.response.status).join(","),
  );
  const afterConcurrent = await listOwnTraces(owner);
  check(
    "trace count is unchanged after concurrent over-limit saves",
    afterConcurrent.memories.length === freeTraceLimit,
    `count=${afterConcurrent.memories.length}`,
  );

  // Deleting frees a slot again.
  const freed = createdTraceIds.pop();
  const freedDelete = await deleteTrace(owner, freed);
  check("owner can delete a trace", freedDelete.status === 200, `status=${freedDelete.status}`);
  const afterDelete = await createTrace(owner, { title: "QA entitlement reuse" });
  check(
    "deleting a trace frees a plan slot",
    afterDelete.response.status === 201,
    `status=${afterDelete.response.status} code=${afterDelete.body?.error?.code || ""}`,
  );
  if (afterDelete.body?.memory?.id) createdTraceIds.push(afterDelete.body.memory.id);
  check(
    "a later save is not mislabeled as the first trace",
    afterDelete.body?.memory?.isFirstTrace === false,
    `isFirstTrace=${afterDelete.body?.memory?.isFirstTrace}`,
  );

  // Empty allowance also blocks the very first save for a brand new full account? No:
  // verify the usage read model instead.
  const ownerUsage = await json(await owner.fetch("/api/entitlements"));
  check(
    "usage endpoint reports the real stored trace count",
    ownerUsage?.usage?.permanentTraces?.used === freeTraceLimit &&
      ownerUsage?.usage?.permanentTraces?.remaining === 0,
    JSON.stringify(ownerUsage?.usage?.permanentTraces),
  );
  check(
    "usage endpoint reports the monthly AI generation allowance",
    ownerUsage?.limits?.aiGenerations === freeGenerationLimit &&
      typeof ownerUsage?.usage?.aiGenerations?.used === "number",
    JSON.stringify(ownerUsage?.usage?.aiGenerations),
  );
  check(
    "monthly AI period key is a UTC calendar month",
    /^\d{4}-\d{2}$/.test(String(ownerUsage?.usage?.aiGenerations?.periodKey || "")),
    String(ownerUsage?.usage?.aiGenerations?.periodKey),
  );

  // ---------------------------------------------------------------- cross-user privacy
  const otherAccount = await signUp(other, "other");
  const otherList = await listOwnTraces(other);
  check(
    "a second account cannot see the first account's traces",
    otherList.memories.length === 0,
    `count=${otherList.memories.length}`,
  );

  const targetTraceId = createdTraceIds[0];
  const crossDelete = await deleteTrace(other, targetTraceId);
  check(
    "a non-owner cannot delete another account's trace",
    crossDelete.status === 403,
    `status=${crossDelete.status}`,
  );

  const crossPatch = await other.fetch(`/api/memories?memoryId=${encodeURIComponent(targetTraceId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "hijacked" }),
  });
  check(
    "a non-owner cannot patch another account's trace",
    crossPatch.status === 403,
    `status=${crossPatch.status}`,
  );

  const crossMediaDelete = await other.fetch(
    `/api/media?key=${encodeURIComponent("users/somebody-else/2026-01-01/img_x.jpg")}`,
    { method: "DELETE" },
  );
  check(
    "a signed-in user cannot delete media outside their own prefix",
    crossMediaDelete.status === 403,
    `status=${crossMediaDelete.status}`,
  );

  const publicList = await json(await guest.fetch("/api/memories"));
  const leaked = (publicList?.memories || []).some((memory) => createdTraceIds.includes(memory.id));
  check("private traces never appear in the public list", !leaked);

  const factsWithoutConfirmation = await owner.fetch(
    `/api/memories?memoryId=${encodeURIComponent(targetTraceId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place: "Changed", eventAt: "2026-02-02" }),
    },
  );
  const factsBody = await json(factsWithoutConfirmation);
  check(
    "fact edits still require explicit confirmation",
    factsWithoutConfirmation.status === 400 && factsBody?.error?.code === "facts_not_confirmed",
    `status=${factsWithoutConfirmation.status} code=${factsBody?.error?.code}`,
  );

  const unconfirmedCreate = await createTrace(owner, { factsConfirmed: false });
  check(
    "creating a trace still requires confirmed facts",
    unconfirmedCreate.response.status === 400 &&
      unconfirmedCreate.body?.error?.code === "facts_not_confirmed",
    `status=${unconfirmedCreate.response.status} code=${unconfirmedCreate.body?.error?.code}`,
  );

  // ---------------------------------------------------------------- retention endpoint
  const noTokenProbe = await guest.fetch("/api/admin/analytics/cleanup");
  check(
    "analytics retention endpoint is closed without an operator token",
    noTokenProbe.status === 403 || noTokenProbe.status === 503,
    `status=${noTokenProbe.status}`,
  );

  const badTokenProbe = await guest.fetch("/api/admin/analytics/cleanup", {
    headers: { "x-triptrace-admin-token": "definitely-not-the-token" },
  });
  check(
    "analytics retention endpoint rejects a wrong operator token",
    badTokenProbe.status === 403 || badTokenProbe.status === 503,
    `status=${badTokenProbe.status}`,
  );

  if (ADMIN_TOKEN) {
    const dryRun = await guest.fetch("/api/admin/analytics/cleanup", {
      headers: { "x-triptrace-admin-token": ADMIN_TOKEN },
    });
    const dryRunBody = await json(dryRun);
    check(
      "analytics retention dry run reports a 90-day cutoff",
      dryRun.status === 200 &&
        dryRunBody?.retentionDays === 90 &&
        typeof dryRunBody?.expired === "number",
      `status=${dryRun.status} retentionDays=${dryRunBody?.retentionDays} expired=${dryRunBody?.expired}`,
    );
  } else {
    console.log("SKIP  analytics retention dry run (set ADMIN_TASK_TOKEN to include it)");
  }

  // ---------------------------------------------------------------- metered AI calls
  // Opt-in because these reach the real provider and cost money.
  if (WITH_AI) {
    const freshGuestId = `qa_guest_ai_${Date.now()}`;
    const firstDemo = await guest.fetch("/api/generate-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moment: "A short automated probe sentence for the guest demo allowance.",
        guestId: freshGuestId,
      }),
    });
    const firstDemoBody = await json(firstDemo);
    check(
      "a fresh guest device gets one real AI draft",
      firstDemo.status === 200 && firstDemoBody?.ai?.source === "openai",
      `status=${firstDemo.status} source=${firstDemoBody?.ai?.source} reason=${firstDemoBody?.ai?.reason || ""}`,
    );

    const secondDemo = await guest.fetch("/api/generate-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moment: "Second guest probe.", guestId: freshGuestId }),
    });
    const secondDemoBody = await json(secondDemo);
    check(
      "the same guest device cannot spend a second AI draft",
      secondDemo.status === 403 && secondDemoBody?.error?.code === "entitlement_guest_demo_used",
      `status=${secondDemo.status} code=${secondDemoBody?.error?.code}`,
    );

    // A provider rejection must hand the allowance back, so a fresh device can retry
    // after a failure without having been charged an allowance unit.
    const refundGuestId = `qa_guest_refund_${Date.now()}`;
    const badImage = "data:image/png;base64,AAAABBBBCCCC";
    const failedOnce = await guest.fetch("/api/generate-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moment: "Refund probe.", guestId: refundGuestId, images: [badImage] }),
    });
    const failedOnceBody = await json(failedOnce);
    check(
      "a provider rejection returns an explicit local fallback",
      failedOnce.status === 200 && failedOnceBody?.ai?.source === "mock",
      `status=${failedOnce.status} source=${failedOnceBody?.ai?.source} reason=${failedOnceBody?.ai?.reason || ""}`,
    );

    const failedTwice = await guest.fetch("/api/generate-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moment: "Refund probe two.", guestId: refundGuestId, images: [badImage] }),
    });
    check(
      "a failed AI request does not consume the allowance",
      failedTwice.status === 200,
      `status=${failedTwice.status}`,
    );
  } else {
    console.log("SKIP  metered AI checks (pass --with-ai to spend real generations)");
  }

  // ---------------------------------------------------------------- cleanup
  const cleanupClient = owner;
  const remaining = await listOwnTraces(cleanupClient);
  for (const memory of remaining.memories) {
    await deleteTrace(cleanupClient, memory.id);
  }
  const afterCleanup = await listOwnTraces(cleanupClient);
  check(
    "test traces are removed after the run",
    afterCleanup.memories.length === 0,
    `count=${afterCleanup.memories.length}`,
  );

  await owner.fetch("/api/auth/signout", { method: "POST" });
  await other.fetch("/api/auth/signout", { method: "POST" });

  console.log("");
  console.log(`QA accounts created (delete from D1 after review): ${ownerAccount.email}, ${otherAccount.email}`);
  console.log(`${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) process.exit(1);
}

run().catch((error) => {
  console.error("\nTest run aborted:", error);
  process.exit(1);
});
