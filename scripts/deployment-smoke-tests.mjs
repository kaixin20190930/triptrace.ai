#!/usr/bin/env node
// Smoke test for a deployed TripTrace.ai Worker.
//
// This implements section 8 of docs/production-provisioning-runbook.md. Each result is
// numbered to match the table in that runbook, so the output can be pasted into
// progress.md as release evidence without re-mapping anything.
//
// Usage:
//   ADMIN_TASK_TOKEN=<production token> node scripts/deployment-smoke-tests.mjs <url> [--with-ai]
//
// The admin token is optional. Without it, check 26 can still confirm that the admin
// endpoints refuse an anonymous caller, which is the security-relevant half.
//
// `--with-ai` spends real OpenAI credit on checks 3 and 4, which is the only way to prove
// the production key works. A text-only draft costs a fraction of a cent.
//
// WARNING: this writes to whatever database the deployment is bound to. It creates two
// throwaway accounts and deletes both at the end, and it never touches pre-existing rows.
// Verify the deployment points at the intended database before running it.

const args = process.argv.slice(2);
const WITH_AI = args.includes("--with-ai");
const ADMIN_TOKEN = process.env.ADMIN_TASK_TOKEN || "";
const BASE_URL = (args.find((arg) => arg.startsWith("http")) || process.env.BASE_URL || "").replace(/\/$/, "");

if (!BASE_URL) {
  console.error("Pass the deployment URL, for example:");
  console.error("  node scripts/deployment-smoke-tests.mjs https://triptrace-ai-next.example.workers.dev");
  process.exit(2);
}

const results = [];
let failures = 0;
let skipped = 0;

function record(number, name, state, detail = "") {
  results.push({ number, name, state, detail });
  if (state === "FAIL") failures += 1;
  if (state === "SKIP") skipped += 1;
  const label = String(number).padStart(2, " ");
  console.log(`${state.padEnd(4)} ${label}. ${name}${detail ? ` :: ${detail}` : ""}`);
}

function check(number, name, condition, detail = "") {
  record(number, name, condition ? "PASS" : "FAIL", detail);
}

function skip(number, name, reason) {
  record(number, name, "SKIP", reason);
}

/** Cookie jar per identity, and it also remembers the raw Set-Cookie for attribute checks. */
function createClient() {
  let cookie = "";
  let lastSetCookie = [];
  return {
    get lastSetCookie() {
      return lastSetCookie;
    },
    clear() {
      cookie = "";
    },
    async fetch(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (cookie) headers.set("Cookie", cookie);
      const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
      lastSetCookie = response.headers.getSetCookie?.() || [];
      for (const raw of lastSetCookie) {
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
  return `qa-smoke-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
}

async function signUp(client, tag) {
  const email = uniqueEmail(tag);
  const password = `Qa!${Math.random().toString(36).slice(2, 12)}A9`;
  const response = await client.fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: `QA ${tag}` }),
  });
  return { response, body: await json(response), email, password };
}

/** 1x1 PNG. Real bytes, negligible size. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

function photoForm(count, prefix = "smoke") {
  const form = new FormData();
  for (let index = 0; index < count; index += 1) {
    form.append("photos", new Blob([TINY_PNG], { type: "image/png" }), `${prefix}-${index}.png`);
  }
  return form;
}

function traceBody(overrides = {}) {
  return {
    title: "QA smoke trace",
    story: "A short factual placeholder written by the deployment smoke test.",
    place: "QA Place",
    mood: "calm",
    tags: ["qa"],
    photoKeys: [],
    isPublic: false,
    eventAt: "2026-01-01",
    datePrecision: "day",
    factualSummary: "Automated smoke test row.",
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

async function deleteAccount(client, password) {
  return client.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, confirm: "DELETE" }),
  });
}

/** Reads a page and reports whether it asks robots to stay away. */
async function pageRobots(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const html = await response.text();
  const header = response.headers.get("x-robots-tag") || "";
  const meta = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(html)?.[0] || "";
  const combined = `${header} ${meta}`.toLowerCase();
  return { status: response.status, noindex: combined.includes("noindex"), meta: meta || header || "(none)" };
}

const owner = createClient();
const second = createClient();
let ownerPassword = "";
let secondPassword = "";
const createdTraceIds = [];

async function run() {
  console.log(`Smoke testing ${BASE_URL}`);
  console.log(`AI checks: ${WITH_AI ? "enabled" : "skipped (pass --with-ai to include)"}`);
  console.log(`Admin token: ${ADMIN_TOKEN ? "provided" : "absent"}\n`);

  // 1. Provider configuration.
  const config = await json(await fetch(`${BASE_URL}/api/generate-memory`));
  check(
    1,
    "GET /api/generate-memory reports a configured provider",
    config?.configured === true && String(config?.provider || "").includes("OpenAI"),
    `configured=${config?.configured} provider=${config?.provider}`,
  );

  // 2. Guest entitlements.
  const guestPlan = await json(await fetch(`${BASE_URL}/api/entitlements`));
  check(
    2,
    "Signed-out entitlements report the guest plan with no permanent traces",
    guestPlan?.plan?.key === "guest" && guestPlan?.limits?.permanentTraces === 0,
    `plan=${guestPlan?.plan?.key} permanentTraces=${guestPlan?.limits?.permanentTraces}`,
  );

  // 3 and 4. Guest AI demo, then its refusal on the second attempt.
  if (WITH_AI) {
    const guest = createClient();
    // A stable guest id, so the second attempt is metered against the same subject rather
    // than falling back to coarse address-based metering.
    const guestId = `qa-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const draftRequest = (moment) => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moment, guestId }),
    });

    const first = await guest.fetch("/api/generate-memory", draftRequest(
      "A quiet afternoon by the river, drinking tea and watching the boats go past.",
    ));
    const firstBody = await json(first);
    check(
      3,
      "A guest can generate one draft from the real provider",
      first.status === 200 && Boolean(firstBody?.story) && firstBody?.ai?.source === "openai",
      `status=${first.status} source=${firstBody?.ai?.source ?? "?"} model=${firstBody?.ai?.model ?? "-"}${
        firstBody?.ai?.reason ? ` reason=${firstBody.ai.reason}` : ""
      }`,
    );

    const secondAttempt = await guest.fetch("/api/generate-memory", draftRequest(
      "Another attempt that the guest allowance should refuse.",
    ));
    const secondBody = await json(secondAttempt);
    check(
      4,
      "A second guest draft is refused with a stable code",
      secondAttempt.status === 403 && secondBody?.error?.code === "entitlement_guest_demo_used",
      `status=${secondAttempt.status} code=${secondBody?.error?.code}`,
    );
  } else {
    skip(3, "A guest can generate one draft", "needs --with-ai, spends real credit");
    skip(4, "A second guest draft is refused with a stable code", "needs --with-ai");
  }

  // 5. Sign up, and the session cookie must be hardened.
  const signup = await signUp(owner, "owner");
  ownerPassword = signup.password;
  const sessionCookie = owner.lastSetCookie.find((raw) => raw.startsWith("tt_session=")) || "";
  const lower = sessionCookie.toLowerCase();
  // `Secure` is set from the request scheme, so it is correctly absent over plain HTTP.
  // Requiring it unconditionally would fail every local run for the wrong reason.
  const httpsExpected = BASE_URL.startsWith("https://");
  const secureOk = httpsExpected ? lower.includes("secure") : !lower.includes("secure");
  check(
    5,
    "Sign up succeeds and sets a hardened session cookie",
    signup.response.status === 201 && secureOk && lower.includes("httponly") && lower.includes("samesite"),
    `status=${signup.response.status} scheme=${httpsExpected ? "https" : "http"} attrs=${
      sessionCookie ? sessionCookie.split(";").slice(1).map((s) => s.trim()).join(" ") : "(none)"
    }`,
  );

  // 6. Free plan entitlements.
  const freePlan = await json(await owner.fetch("/api/entitlements"));
  check(
    6,
    "Signed-in entitlements report the free plan allowances",
    freePlan?.plan?.key === "free" &&
      freePlan?.limits?.permanentTraces === 3 &&
      freePlan?.limits?.aiGenerations === 5,
    `plan=${freePlan?.plan?.key} traces=${freePlan?.limits?.permanentTraces} generations=${freePlan?.limits?.aiGenerations}`,
  );

  // 7. Photo grouping is a client-side concern with no server endpoint.
  skip(
    7,
    "Importing 40 photos groups them into candidate traces",
    "clustering runs in the browser; covered by npm run test:clustering, needs manual QA",
  );

  // 8. Signed-in upload lands under the owner's own prefix.
  const uploadResponse = await owner.fetch("/api/media", { method: "POST", body: photoForm(2) });
  const uploadBody = await json(uploadResponse);
  const uploadedKeys = (uploadBody?.files || []).map((file) => file.key).filter(Boolean);
  const ownerId = signup.body?.user?.id || "";
  check(
    8,
    "A signed-in upload succeeds and is namespaced to the owner",
    uploadResponse.status === 201 &&
      uploadedKeys.length === 2 &&
      uploadedKeys.every((key) => key.startsWith(`users/${ownerId}/`)),
    `status=${uploadResponse.status} keys=${uploadedKeys.length} prefixOk=${uploadedKeys.every((key) =>
      key.startsWith(`users/${ownerId}/`),
    )}`,
  );

  // 9. First permanent save.
  const firstTrace = await createTrace(owner, { photoKeys: uploadedKeys, title: "QA smoke first trace" });
  if (firstTrace.body?.memory?.id) createdTraceIds.push(firstTrace.body.memory.id);
  check(
    9,
    "Saving with confirmed facts creates the first trace",
    firstTrace.response.status === 201 && firstTrace.body?.memory?.isFirstTrace === true,
    `status=${firstTrace.response.status} isFirstTrace=${firstTrace.body?.memory?.isFirstTrace}`,
  );

  // 10. Second save must not repeat the activation signal.
  const secondTrace = await createTrace(owner, { title: "QA smoke second trace" });
  if (secondTrace.body?.memory?.id) createdTraceIds.push(secondTrace.body.memory.id);
  check(
    10,
    "A second save is not reported as the first trace",
    secondTrace.response.status === 201 && secondTrace.body?.memory?.isFirstTrace === false,
    `status=${secondTrace.response.status} isFirstTrace=${secondTrace.body?.memory?.isFirstTrace}`,
  );

  const mediaKey = uploadedKeys[0] || "";
  const mediaPath = `/api/media?key=${encodeURIComponent(mediaKey)}`;

  // 11. Owner can read own media.
  const ownerRead = await owner.fetch(mediaPath);
  check(11, "The owner can read their own media", ownerRead.status === 200, `status=${ownerRead.status}`);

  // 12. Anonymous cannot.
  const anonRead = await fetch(`${BASE_URL}${mediaPath}`);
  check(12, "The same media is refused when signed out", anonRead.status === 403, `status=${anonRead.status}`);

  // 13. A different account cannot.
  const secondSignup = await signUp(second, "second");
  secondPassword = secondSignup.password;
  const foreignRead = await second.fetch(mediaPath);
  check(
    13,
    "The same media is refused for a different account",
    foreignRead.status === 403,
    `status=${foreignRead.status}`,
  );

  // 14. Free plan trace ceiling, enforced on the server.
  const thirdTrace = await createTrace(owner, { title: "QA smoke third trace" });
  if (thirdTrace.body?.memory?.id) createdTraceIds.push(thirdTrace.body.memory.id);
  const fourthTrace = await createTrace(owner, { title: "QA smoke fourth trace" });
  if (fourthTrace.body?.memory?.id) createdTraceIds.push(fourthTrace.body.memory.id);
  check(
    14,
    "The fourth save on Free is refused with a stable code",
    thirdTrace.response.status === 201 &&
      fourthTrace.response.status === 403 &&
      fourthTrace.body?.error?.code === "entitlement_trace_limit_reached",
    `third=${thirdTrace.response.status} fourth=${fourthTrace.response.status} code=${fourthTrace.body?.error?.code}`,
  );

  // 15. Per-request image ceiling.
  const overLimit = await owner.fetch("/api/media", { method: "POST", body: photoForm(21, "over") });
  const overLimitBody = await json(overLimit);
  check(
    15,
    "An upload of 21 images is refused with a stable code",
    overLimit.status === 400 && overLimitBody?.error?.code === "entitlement_image_limit_exceeded",
    `status=${overLimit.status} code=${overLimitBody?.error?.code}`,
  );

  // 16. Share link readable by an anonymous visitor, including its photos.
  const sharedTraceId = createdTraceIds[0];
  const shareCreate = await owner.fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memoryId: sharedTraceId }),
  });
  const shareBody = await json(shareCreate);
  // The token is returned exactly once, embedded in the share URL, and stored only as a hash.
  const token = String(shareBody?.url || "").split("/s/")[1] || "";
  const linkId = shareBody?.link?.id || "";
  let sharedRead = null;
  let sharedMedia = null;
  if (token) {
    sharedRead = await fetch(`${BASE_URL}/api/shared/${token}`);
    sharedMedia = await fetch(`${BASE_URL}/api/shared/${token}/media/0`);
  }
  check(
    16,
    "A share link and its photos are readable while signed out",
    shareCreate.status === 201 && Boolean(token) && sharedRead?.status === 200 && sharedMedia?.status === 200,
    `create=${shareCreate.status} read=${sharedRead?.status ?? "-"} media=${sharedMedia?.status ?? "-"}`,
  );

  // 17. Revocation must close both the page and the photos.
  if (token && linkId) {
    const revoke = await owner.fetch(`/api/share?linkId=${encodeURIComponent(linkId)}`, { method: "DELETE" });
    const afterRead = await fetch(`${BASE_URL}/api/shared/${token}`);
    const afterMedia = await fetch(`${BASE_URL}/api/shared/${token}/media/0`);
    check(
      17,
      "Revoking the link closes both the trace and its photos",
      revoke.ok && afterRead.status === 404 && afterMedia.status === 404,
      `revoke=${revoke.status} read=${afterRead.status} media=${afterMedia.status}`,
    );
  } else {
    check(
      17,
      "Revoking the link closes both the trace and its photos",
      false,
      `no usable share link was issued (token=${Boolean(token)} linkId=${Boolean(linkId)})`,
    );
  }

  // 18. Deleting a trace must also drop its media.
  const deleteTarget = createdTraceIds[0];
  const deleteResponse = await owner.fetch(`/api/memories?memoryId=${encodeURIComponent(deleteTarget)}`, {
    method: "DELETE",
  });
  const mediaAfterDelete = await owner.fetch(mediaPath);
  check(
    18,
    "Deleting a trace removes its media",
    deleteResponse.status === 200 && mediaAfterDelete.status === 404,
    `delete=${deleteResponse.status} media=${mediaAfterDelete.status}`,
  );
  if (deleteResponse.status === 200) createdTraceIds.shift();

  // 19. Data portability, JSON.
  const exportResponse = await owner.fetch("/api/export");
  const exportBody = await json(exportResponse);
  const exportIsAttachment = (exportResponse.headers.get("content-disposition") || "").includes("attachment");
  check(
    19,
    "The JSON export is complete, versioned, and downloadable",
    exportResponse.status === 200 &&
      exportIsAttachment &&
      exportBody?.formatVersion === 1 &&
      Boolean(exportBody?.account?.email) &&
      Array.isArray(exportBody?.traces) &&
      exportBody.traces.length === createdTraceIds.length,
    `status=${exportResponse.status} attachment=${exportIsAttachment} formatVersion=${exportBody?.formatVersion} traces=${exportBody?.traces?.length} expected=${createdTraceIds.length}`,
  );

  // 20. Data portability, archive.
  const archiveResponse = await owner.fetch("/api/export/archive");
  const archiveBuffer = archiveResponse.ok ? Buffer.from(await archiveResponse.arrayBuffer()) : Buffer.alloc(0);
  const isZip = archiveBuffer.length > 4 && archiveBuffer[0] === 0x50 && archiveBuffer[1] === 0x4b;
  check(
    20,
    "The archive export is a real ZIP",
    archiveResponse.status === 200 && isZip,
    `status=${archiveResponse.status} bytes=${archiveBuffer.length} magic=${isZip ? "PK" : "not a zip"}`,
  );

  // 25. Webhook signature enforcement. Run before account deletion for ordering convenience.
  //
  // Two outcomes are both correct, and which one you get depends on whether Stripe is set up.
  // With a webhook secret present the signature check runs and refuses the unsigned request.
  // Without one the route fails shut before it reads the body, so no unsigned event can ever
  // be processed. Requiring only the first would fail this check for the entire period before
  // Stripe exists, which would be misleading rather than informative.
  const webhook = await fetch(`${BASE_URL}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "evt_smoke", type: "checkout.session.completed" }),
  });
  const webhookBody = await json(webhook);
  const code = webhookBody?.error?.code;
  const signatureEnforced = webhook.status === 400 && code === "stripe_missing_signature";
  const failsShut = webhook.status === 503 && code === "billing_not_configured";
  check(
    25,
    "An unsigned billing webhook is never processed",
    signatureEnforced || failsShut,
    `status=${webhook.status} code=${code} :: ${
      signatureEnforced ? "signature enforced" : failsShut ? "fails shut, Stripe not configured yet" : "unexpected"
    }`,
  );

  // 26. Admin endpoints must refuse anonymous callers.
  const adminPaths = ["/api/admin/analytics/cleanup", "/api/admin/analytics/summary", "/api/admin/media/cleanup"];
  const adminStatuses = [];
  for (const path of adminPaths) {
    const response = await fetch(`${BASE_URL}${path}`);
    adminStatuses.push(`${path.split("/").slice(-2).join("/")}=${response.status}`);
  }
  const allRefused = adminStatuses.every((entry) => entry.endsWith("=403") || entry.endsWith("=503"));
  check(26, "Admin endpoints refuse callers without a token", allRefused, adminStatuses.join(" "));

  // 22. Private surfaces must ask robots to stay away.
  const privatePages = ["/vault", "/timeline", "/map", "/plan"];
  const privateRobots = [];
  for (const path of privatePages) {
    const info = await pageRobots(path);
    privateRobots.push(`${path}=${info.status}/${info.noindex ? "noindex" : "INDEXABLE"}`);
  }
  check(
    22,
    "Private surfaces load and are noindex",
    privateRobots.every((entry) => entry.includes("=200/noindex")),
    privateRobots.join(" "),
  );

  // 23. The map asset is first-party, which is the whole point of self-drawing it.
  const landResponse = await fetch(`${BASE_URL}/world-land.json`);
  const landType = landResponse.headers.get("content-type") || "";
  check(
    23,
    "The map land asset is served from our own origin",
    landResponse.status === 200 && landType.includes("json"),
    `status=${landResponse.status} type=${landType}`,
  );

  // 24. Legal pages exist and are reachable from the footer.
  const legal = [];
  for (const path of ["/privacy", "/terms"]) {
    const response = await fetch(`${BASE_URL}${path}`);
    legal.push(`${path}=${response.status}`);
  }
  const home = await fetch(`${BASE_URL}/`).then((response) => response.text());
  const linked = home.includes('href="/privacy"') && home.includes('href="/terms"');
  check(
    24,
    "Legal pages load and are linked from the home page",
    legal.every((entry) => entry.endsWith("=200")) && linked,
    `${legal.join(" ")} linkedFromHome=${linked}`,
  );

  // 27. Public surfaces must remain indexable.
  const publicRobots = [];
  for (const path of ["/", "/explore"]) {
    const info = await pageRobots(path);
    publicRobots.push(`${path}=${info.status}/${info.noindex ? "NOINDEX" : "indexable"}`);
  }
  check(
    27,
    "Public surfaces load and are indexable",
    publicRobots.every((entry) => entry.includes("/indexable")),
    publicRobots.join(" "),
  );

  // 21. Account deletion, last because it ends the session.
  const wrongPassword = await deleteAccount(owner, "definitely-not-the-password");
  const deletion = await deleteAccount(owner, ownerPassword);
  const signInAfter = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: signup.email, password: ownerPassword }),
  });
  check(
    21,
    "Account deletion requires the password and is irreversible",
    wrongPassword.status === 403 && deletion.status === 200 && signInAfter.status === 401,
    `wrongPassword=${wrongPassword.status} delete=${deletion.status} signInAfter=${signInAfter.status}`,
  );

  // Clean up the second identity so the deployment is left as it was found.
  const secondDeletion = await deleteAccount(second, secondPassword);
  console.log(
    `\nCleanup: second throwaway account deletion returned ${secondDeletion.status}${
      secondDeletion.status === 200 ? "" : " (delete it manually)"
    }`,
  );
}

run()
  .catch((error) => {
    console.error(`\nSmoke test aborted: ${error.message}`);
    failures += 1;
  })
  .finally(() => {
    const passed = results.filter((entry) => entry.state === "PASS").length;
    console.log(`\n${passed} passed, ${failures} failed, ${skipped} skipped, of ${results.length} checks`);
    if (failures > 0) {
      console.log("\nFailures:");
      for (const entry of results.filter((item) => item.state === "FAIL")) {
        console.log(`  ${entry.number}. ${entry.name} :: ${entry.detail}`);
      }
    }
    process.exit(failures > 0 ? 1 : 0);
  });
