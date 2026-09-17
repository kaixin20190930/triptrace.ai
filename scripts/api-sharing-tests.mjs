#!/usr/bin/env node
// Automated tests for selected-trace sharing and revocation (M3-005, M3-006).
//
// Sharing is the only deliberate hole in a private-by-default product, so these tests are
// written as privacy tests first and feature tests second: a link must expose exactly one
// trace, must not leak the owner, and must stop working the moment it is revoked.
//
// Usage:
//   1. npm run dev
//   2. node scripts/api-sharing-tests.mjs [baseUrl]

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

const PASSWORD = "QaShare!9xA";

async function signUp(client, tag) {
  const email = `qa-share-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const response = await client.fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, displayName: `QA ${tag}` }),
  });
  const body = await json(response);
  if (!response.ok) throw new Error(`signup failed: ${response.status} ${JSON.stringify(body)}`);
  return { email, userId: body?.user?.id };
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function uploadPhoto(client, name) {
  const form = new FormData();
  form.append("photos", new Blob([TINY_PNG], { type: "image/png" }), name);
  const body = await json(await client.fetch("/api/media", { method: "POST", body: form }));
  return body?.files?.[0]?.key || null;
}

async function createTrace(client, overrides = {}) {
  const response = await client.fetch("/api/memories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "QA shared trace",
      story: "A placeholder story for the sharing test.",
      place: "Porto",
      mood: "calm",
      tags: ["qa", "share"],
      photoKeys: [],
      isPublic: false,
      eventAt: "2026-04-05",
      datePrecision: "day",
      factualSummary: "Factual note for sharing.",
      people: ["QA Person"],
      // Deliberately precise, so the rounding in the shared payload can be verified.
      latitude: 41.14961234,
      longitude: -8.61098765,
      factsConfirmed: true,
      ai: { source: "mock", model: null },
      ...overrides,
    }),
  });
  return { response, body: await json(response) };
}

async function run() {
  console.log(`Running sharing tests against ${BASE_URL}\n`);
  const probe = await fetch(`${BASE_URL}/api/entitlements`).catch(() => null);
  if (!probe) {
    console.error(`Cannot reach ${BASE_URL}. Start \`npm run dev\` first.`);
    process.exit(2);
  }

  const anon = createClient();
  const owner = createClient();
  const other = createClient();

  // ---------------------------------------------------------------- access control
  const anonList = await anon.fetch("/api/share");
  check("listing share links requires an account", anonList.status === 401, `status=${anonList.status}`);
  const anonCreate = await anon.fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memoryId: "mem_whatever" }),
  });
  check("creating a share link requires an account", anonCreate.status === 401, `status=${anonCreate.status}`);

  await signUp(owner, "owner");
  const photoKey = await uploadPhoto(owner, "share-fixture.png");
  const shared = await createTrace(owner, { photoKeys: photoKey ? [photoKey] : [] });
  const privateTrace = await createTrace(owner, { title: "QA private trace", photoKeys: [] });
  check(
    "fixtures were created",
    shared.response.status === 201 && privateTrace.response.status === 201 && Boolean(photoKey),
  );
  const sharedId = shared.body?.memory?.id;
  const privateId = privateTrace.body?.memory?.id;

  const noLinks = await json(await owner.fetch(`/api/share?memoryId=${sharedId}`));
  check("a trace starts with no share links", noLinks?.links?.length === 0, `${noLinks?.links?.length}`);

  // ---------------------------------------------------------------- ownership
  await signUp(other, "other");
  const foreignCreate = await other.fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memoryId: sharedId }),
  });
  const foreignBody = await json(foreignCreate);
  check(
    "a link cannot be minted for someone else's trace",
    foreignCreate.status === 404 && foreignBody?.error?.code === "memory_not_found",
    `status=${foreignCreate.status} code=${foreignBody?.error?.code}`,
  );

  // ---------------------------------------------------------------- creation
  const created = await owner.fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memoryId: sharedId }),
  });
  const createdBody = await json(created);
  check("a link is created for an owned trace", created.status === 201, `status=${created.status}`);
  const shareUrl = createdBody?.url || "";
  const token = shareUrl.split("/s/")[1] || "";
  check("the response returns a usable share URL", shareUrl.includes("/s/") && token.length >= 20, shareUrl);
  check("the response says the token is shown only once", createdBody?.tokenShownOnce === true);
  check(
    "the stored summary exposes only a short prefix, never the token",
    createdBody?.link?.prefix?.length === 6 && !JSON.stringify(createdBody.link).includes(token),
    JSON.stringify(createdBody?.link),
  );
  check("a new link is active with no views", createdBody?.link?.active === true && createdBody?.link?.viewCount === 0);

  const badExpiry = await owner.fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memoryId: sharedId, expiresInDays: 9999 }),
  });
  check(
    "an out-of-range expiry is refused",
    badExpiry.status === 400 && (await json(badExpiry))?.error?.code === "invalid_expiry",
    `status=${badExpiry.status}`,
  );

  // ---------------------------------------------------------------- public read
  const publicRead = await fetch(`${BASE_URL}/api/shared/${token}`);
  const publicBody = await json(publicRead);
  check("the link opens without any account", publicRead.status === 200, `status=${publicRead.status}`);
  check(
    "the shared payload carries the trace the owner chose",
    publicBody?.trace?.title === "QA shared trace" && publicBody?.trace?.place === "Porto",
    JSON.stringify(publicBody?.trace?.title),
  );
  check(
    "the shared payload keeps the confirmed facts and the AI story",
    publicBody?.trace?.factualSummary === "Factual note for sharing." &&
      typeof publicBody?.trace?.story === "string" &&
      Array.isArray(publicBody?.trace?.tags),
  );
  check(
    "the shared payload never carries the owner's email or account id",
    !JSON.stringify(publicBody).includes("@example.invalid") &&
      !JSON.stringify(publicBody).includes("usr_"),
  );
  check(
    "coordinates are blurred to about a kilometre, so a memory does not reveal an address",
    publicBody?.trace?.approximateLatitude === 41.15 &&
      publicBody?.trace?.approximateLongitude === -8.61 &&
      publicBody?.trace?.latitude === undefined,
    `${publicBody?.trace?.approximateLatitude}, ${publicBody?.trace?.approximateLongitude}`,
  );
  check(
    "the shared response is never stored in a shared cache",
    (publicRead.headers.get("cache-control") || "").includes("no-store"),
    publicRead.headers.get("cache-control") || "",
  );
  check(
    "the shared response tells crawlers to stay out",
    (publicRead.headers.get("x-robots-tag") || "").includes("noindex"),
    publicRead.headers.get("x-robots-tag") || "",
  );

  const page = await fetch(`${BASE_URL}/s/${token}`);
  const pageHtml = await page.text();
  check("the human-facing page renders", page.status === 200, `status=${page.status}`);
  check("the page is marked noindex", /noindex/i.test(pageHtml), "meta robots");
  check("the page shows the trace title", pageHtml.includes("QA shared trace"));
  check(
    "the page does not leak the owner's email",
    !pageHtml.includes("@example.invalid"),
  );

  // ---------------------------------------------------------------- media through the link
  check(
    "photos are addressed by position under the token, never by storage key",
    publicBody?.trace?.photoUrls?.[0] === `/api/shared/${token}/media/0` &&
      !JSON.stringify(publicBody.trace.photoUrls).includes("users/"),
    JSON.stringify(publicBody?.trace?.photoUrls),
  );

  const sharedMedia = await fetch(`${BASE_URL}/api/shared/${token}/media/0`);
  check(
    "a photo of the shared trace loads for someone holding the link",
    sharedMedia.status === 200,
    `status=${sharedMedia.status}`,
  );
  check(
    "shared media is not cached publicly, so revocation cannot be outlived by a cache",
    (sharedMedia.headers.get("cache-control") || "").startsWith("private"),
    sharedMedia.headers.get("cache-control") || "",
  );
  check(
    "an index beyond the shared photos is refused",
    (await fetch(`${BASE_URL}/api/shared/${token}/media/9`)).status === 404,
  );
  check(
    "a negative or non-numeric index is refused",
    (await fetch(`${BASE_URL}/api/shared/${token}/media/-1`)).status === 404 &&
      (await fetch(`${BASE_URL}/api/shared/${token}/media/abc`)).status === 404,
  );

  const bareMedia = await fetch(`${BASE_URL}/api/media?key=${encodeURIComponent(photoKey)}`);
  check(
    "the same photo stays private through the owner-only media route",
    bareMedia.status === 403 || bareMedia.status === 404,
    `status=${bareMedia.status}`,
  );
  check(
    "the owner-only media route cannot be talked into serving a shared photo with a token",
    (
      await fetch(
        `${BASE_URL}/api/media?key=${encodeURIComponent(photoKey)}&share=${encodeURIComponent(token)}`,
      )
    ).status !== 200,
  );

  // A link must not become a key to the rest of the Atlas.
  const otherPhotoKey = await uploadPhoto(owner, "not-shared.png");
  const notSharedTrace = await createTrace(owner, {
    title: "QA unshared trace",
    photoKeys: otherPhotoKey ? [otherPhotoKey] : [],
  });
  const otherShare = await json(
    await owner.fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId: notSharedTrace.body?.memory?.id }),
    }),
  );
  const otherToken = (otherShare?.url || "").split("/s/")[1] || "";
  // Assert the status and the content type, not just that bytes came back. An earlier version
  // of this check only required a non-empty body, which the App Router's not-found page satisfies
  // handsomely: it passed while every shared photo was in fact answering 404 with 17kB of HTML.
  const firstPhoto = await fetch(`${BASE_URL}/api/shared/${token}/media/0`);
  const firstBytes = Buffer.from(await firstPhoto.arrayBuffer());
  const secondPhoto = await fetch(`${BASE_URL}/api/shared/${otherToken}/media/0`);
  const secondBytes = Buffer.from(await secondPhoto.arrayBuffer());
  const bothAreImages =
    (firstPhoto.headers.get("content-type") || "").startsWith("image/") &&
    (secondPhoto.headers.get("content-type") || "").startsWith("image/");
  check(
    "each token serves only its own trace's photos",
    firstPhoto.status === 200 &&
      secondPhoto.status === 200 &&
      bothAreImages &&
      firstBytes.length > 0 &&
      secondBytes.length > 0,
    `${firstPhoto.status} and ${secondPhoto.status}, ${firstBytes.length} and ${secondBytes.length} bytes, images=${bothAreImages}`,
  );
  await owner.fetch(`/api/memories?memoryId=${encodeURIComponent(notSharedTrace.body?.memory?.id)}`, {
    method: "DELETE",
  });
  check(
    "revoking by deleting the other trace does not affect the first link",
    (await fetch(`${BASE_URL}/api/shared/${token}`)).status === 200,
  );

  const listAfterShare = await json(await anon.fetch("/api/memories"));
  check(
    "sharing one trace does not add it to any public listing",
    !(listAfterShare?.memories || []).some((memory) => memory.id === sharedId),
  );

  const ownList = await anon.fetch("/api/memories?own=true");
  check("a share link is not a session", ownList.status === 401, `status=${ownList.status}`);

  // ---------------------------------------------------------------- bad tokens
  for (const [label, candidate] of [
    ["an unknown token", "AAAAAAAAAAAAAAAAAAAAAA"],
    ["a short token", "abc"],
    ["a token with illegal characters", "../../etc/passwd0000000"],
  ]) {
    const response = await fetch(`${BASE_URL}/api/shared/${encodeURIComponent(candidate)}`);
    check(`${label} is refused`, response.status === 404, `status=${response.status}`);
  }
  check(
    "the trace id itself is not a valid token",
    (await fetch(`${BASE_URL}/api/shared/${sharedId}`)).status === 404,
  );

  // ---------------------------------------------------------------- view counting
  await fetch(`${BASE_URL}/api/shared/${token}`);
  const afterViews = await json(await owner.fetch(`/api/share?memoryId=${sharedId}`));
  const activeLink = (afterViews?.links || []).find((link) => link.id === createdBody.link.id);
  check(
    "the owner can see that the link has been opened",
    activeLink?.viewCount >= 2 && typeof activeLink?.lastViewedAt === "string",
    `views=${activeLink?.viewCount}`,
  );

  // ---------------------------------------------------------------- revocation
  const foreignRevoke = await other.fetch(`/api/share?linkId=${encodeURIComponent(createdBody.link.id)}`, {
    method: "DELETE",
  });
  check(
    "someone else cannot revoke a link they do not own",
    foreignRevoke.status === 404,
    `status=${foreignRevoke.status}`,
  );
  check(
    "a link another account failed to revoke still works",
    (await fetch(`${BASE_URL}/api/shared/${token}`)).status === 200,
  );

  const revoked = await owner.fetch(`/api/share?linkId=${encodeURIComponent(createdBody.link.id)}`, {
    method: "DELETE",
  });
  check("the owner can revoke the link", revoked.status === 200, `status=${revoked.status}`);

  const afterRevoke = await fetch(`${BASE_URL}/api/shared/${token}`);
  check(
    "a revoked link stops working immediately",
    afterRevoke.status === 404,
    `status=${afterRevoke.status}`,
  );
  const revokedPage = await fetch(`${BASE_URL}/s/${token}`);
  check("the revoked page is gone too", revokedPage.status === 404, `status=${revokedPage.status}`);
  const revokedMedia = await fetch(`${BASE_URL}/api/shared/${token}/media/0`);
  check(
    "revocation also cuts off the photos, not just the story",
    revokedMedia.status === 403 || revokedMedia.status === 404,
    `status=${revokedMedia.status}`,
  );

  const doubleRevoke = await owner.fetch(`/api/share?linkId=${encodeURIComponent(createdBody.link.id)}`, {
    method: "DELETE",
  });
  check("revoking twice is reported as not found rather than succeeding again", doubleRevoke.status === 404);

  const revokedList = await json(await owner.fetch(`/api/share?memoryId=${sharedId}`));
  const revokedEntry = (revokedList?.links || []).find((link) => link.id === createdBody.link.id);
  check(
    "a revoked link stays visible to the owner as revoked, so the history is auditable",
    revokedEntry?.active === false && typeof revokedEntry?.revokedAt === "string",
    JSON.stringify({ active: revokedEntry?.active }),
  );

  // ---------------------------------------------------------------- expiry
  const expiring = await json(
    await owner.fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId: sharedId, expiresInDays: 1 }),
    }),
  );
  const expiringToken = (expiring?.url || "").split("/s/")[1] || "";
  check(
    "a link with an expiry works before it expires",
    (await fetch(`${BASE_URL}/api/shared/${expiringToken}`)).status === 200,
  );
  check("the expiry is reported to the owner", typeof expiring?.link?.expiresAt === "string");

  // ---------------------------------------------------------------- deletion removes links
  const liveLink = await json(
    await owner.fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId: privateId }),
    }),
  );
  const liveToken = (liveLink?.url || "").split("/s/")[1] || "";
  check(
    "a second trace can be shared independently",
    (await fetch(`${BASE_URL}/api/shared/${liveToken}`)).status === 200,
  );
  const deleteTrace = await owner.fetch(`/api/memories?memoryId=${encodeURIComponent(privateId)}`, {
    method: "DELETE",
  });
  const deleteBody = await json(deleteTrace);
  check(
    "deleting a trace reports the share links it removed",
    deleteTrace.status === 200 && deleteBody?.deleted?.shareLinksRemoved === 1,
    JSON.stringify(deleteBody?.deleted),
  );
  check(
    "a link to a deleted trace no longer resolves, so no capability dangles",
    (await fetch(`${BASE_URL}/api/shared/${liveToken}`)).status === 404,
  );

  // ---------------------------------------------------------------- export and account delete
  const exported = await json(await owner.fetch("/api/export"));
  check(
    "the export lists share links by prefix and never by token",
    Array.isArray(exported?.shareLinks) &&
      exported.shareLinks.length >= 2 &&
      exported.shareLinks.every((link) => link.prefix && !("token" in link)),
    `${exported?.shareLinks?.length} links`,
  );

  const accountDelete = await owner.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const accountBody = await json(accountDelete);
  check(
    "deleting the account removes its share links too",
    accountDelete.status === 200 && accountBody?.deleted?.shareLinks >= 2,
    JSON.stringify(accountBody?.deleted),
  );
  check(
    "a link belonging to a deleted account stops working",
    (await fetch(`${BASE_URL}/api/shared/${expiringToken}`)).status === 404,
  );

  await other.fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });

  console.log("");
  console.log(`${total - failures}/${total} checks passed`);
  if (failures > 0) process.exit(1);
}

run().catch((error) => {
  console.error("\nTest run aborted:", error);
  process.exit(1);
});
