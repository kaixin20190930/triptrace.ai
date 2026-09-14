// Tests for the hand-written ZIP writer used by the data export (M3-007).
//
// The important property is not that the bytes look plausible but that a real unzip
// implementation accepts them, so this writes an archive to disk and shells out to the
// system `unzip` to verify and extract it.
//
// Run with: npm run test:unit

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, createZipStream } from "../src/lib/server/zip.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

const encoder = new TextEncoder();

// ---------------------------------------------------------------- crc32
// Known-answer tests against the standard CRC-32 used by ZIP and PNG.
check("crc32 of an empty input is zero", crc32(new Uint8Array()) === 0, String(crc32(new Uint8Array())));
check(
  "crc32 of \"123456789\" matches the published value",
  crc32(encoder.encode("123456789")) === 0xcbf43926,
  `0x${crc32(encoder.encode("123456789")).toString(16)}`,
);
check(
  "crc32 of \"The quick brown fox jumps over the lazy dog\" matches the published value",
  crc32(encoder.encode("The quick brown fox jumps over the lazy dog")) === 0x414fa339,
  `0x${crc32(encoder.encode("The quick brown fox jumps over the lazy dog")).toString(16)}`,
);
check(
  "crc32 changes when a single byte changes",
  crc32(encoder.encode("hello")) !== crc32(encoder.encode("hellp")),
);
check("crc32 is always an unsigned 32-bit value", crc32(encoder.encode("hello")) >= 0);

// ---------------------------------------------------------------- structure
const empty = await collect(createZipStream([]));
check("an empty archive is just the end record", empty.length === 22, `${empty.length} bytes`);
check(
  "an empty archive still starts with the end-of-directory signature",
  empty[0] === 0x50 && empty[1] === 0x4b && empty[2] === 0x05 && empty[3] === 0x06,
);

const single = await collect(
  createZipStream([
    { name: "manifest.json", read: async () => encoder.encode('{"ok":true}') },
  ]),
);
check(
  "an archive with one entry starts with a local file header",
  single[0] === 0x50 && single[1] === 0x4b && single[2] === 0x03 && single[3] === 0x04,
);

// ---------------------------------------------------------------- real unzip
let unzipAvailable = true;
try {
  execFileSync("unzip", ["-v"], { stdio: "ignore" });
} catch {
  unzipAvailable = false;
}

if (!unzipAvailable) {
  console.log("SKIP  system unzip verification (unzip not available)");
} else {
  const dir = mkdtempSync(join(tmpdir(), "triptrace-zip-"));
  try {
    const manifest = JSON.stringify({ traces: 2, exportedAt: "2026-09-02T00:00:00.000Z" }, null, 2);
    // Binary content with every byte value, to catch any byte-mangling in the writer.
    const binary = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) binary[i] = i;
    const nested = encoder.encode("photo bytes stand-in");
    const unicode = encoder.encode("unicode body");

    const archive = await collect(
      createZipStream([
        { name: "manifest.json", read: async () => encoder.encode(manifest) },
        { name: "media/all-bytes.bin", read: async () => binary },
        { name: "media/2026-05-01/photo.jpg", read: async () => nested },
        { name: "missing.txt", read: async () => null },
        { name: "notes/reading.txt", read: async () => unicode },
      ]),
    );

    const archivePath = join(dir, "export.zip");
    writeFileSync(archivePath, archive);

    let testOutput = "";
    let testPassed = true;
    try {
      testOutput = execFileSync("unzip", ["-t", archivePath], { encoding: "utf8" });
    } catch (error) {
      testPassed = false;
      testOutput = String(error);
    }
    check(
      "the archive passes an integrity test by the system unzip",
      testPassed && /No errors detected/i.test(testOutput),
      testOutput.split("\n").filter(Boolean).slice(-1)[0] || "",
    );

    const listing = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    check(
      "every readable entry is listed and the unreadable one is skipped",
      listing.sort().join(",") ===
        ["manifest.json", "media/all-bytes.bin", "media/2026-05-01/photo.jpg", "notes/reading.txt"]
          .sort()
          .join(","),
      listing.join(","),
    );
    check("a skipped entry does not appear in the archive", !listing.includes("missing.txt"));

    execFileSync("unzip", ["-q", "-o", archivePath, "-d", join(dir, "out")]);
    const extractedManifest = readFileSync(join(dir, "out", "manifest.json"), "utf8");
    check("an extracted text entry is byte-identical", extractedManifest === manifest);

    const extractedBinary = new Uint8Array(readFileSync(join(dir, "out", "media/all-bytes.bin")));
    check(
      "an extracted binary entry preserves all 256 byte values",
      extractedBinary.length === 256 && extractedBinary.every((byte, i) => byte === i),
      `${extractedBinary.length} bytes`,
    );

    const extractedNested = readFileSync(join(dir, "out", "media/2026-05-01/photo.jpg"), "utf8");
    check("nested paths are created correctly", extractedNested === "photo bytes stand-in");

    // A larger archive, to confirm the central directory offsets stay correct past the
    // first few entries.
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `media/file-${String(i).padStart(3, "0")}.bin`,
      read: async () => encoder.encode(`entry ${i} `.repeat(50)),
    }));
    const manyArchive = await collect(createZipStream(many));
    const manyPath = join(dir, "many.zip");
    writeFileSync(manyPath, manyArchive);
    let manyPassed = true;
    let manyOutput = "";
    try {
      manyOutput = execFileSync("unzip", ["-t", manyPath], { encoding: "utf8" });
    } catch (error) {
      manyPassed = false;
      manyOutput = String(error);
    }
    check(
      "a 40-entry archive also passes integrity checking",
      manyPassed && /No errors detected/i.test(manyOutput),
      manyOutput.split("\n").filter(Boolean).slice(-1)[0] || "",
    );
    const manyListing = execFileSync("unzip", ["-Z1", manyPath], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.trim());
    check("every entry of the larger archive is present", manyListing.length === 40, `${manyListing.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
