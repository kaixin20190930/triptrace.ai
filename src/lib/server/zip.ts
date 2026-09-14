/**
 * Minimal streaming ZIP writer.
 *
 * Written by hand rather than pulled from a dependency because the requirement is narrow:
 * bundle a manifest and a set of already-compressed JPEGs so a user can take their Atlas
 * with them. Re-compressing JPEG data would burn CPU for almost no size gain, so every
 * entry is stored uncompressed.
 *
 * Memory is bounded to one file at a time. Each entry is buffered only long enough to
 * compute its CRC32 and length, then written out and released, so a large archive never
 * has to fit in the Worker's memory at once.
 *
 * Deliberately not implemented: Zip64, encryption, and directory entries. Callers must
 * bound the archive so that no entry and no total exceeds the 4 GB limit of classic ZIP.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date and time, which is what the ZIP format stores. */
function dosDateTime(date: Date): { time: number; date: number } {
  // The DOS epoch starts in 1980 and stores seconds in two-second units.
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time:
      (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (Math.floor(date.getUTCSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

class ByteWriter {
  private bytes: number[] = [];

  u16(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
    return this;
  }

  u32(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    return this;
  }

  raw(bytes: Uint8Array) {
    for (const byte of bytes) this.bytes.push(byte);
    return this;
  }

  toUint8Array() {
    return new Uint8Array(this.bytes);
  }
}

export type ZipEntrySource = {
  /** Path inside the archive, using forward slashes. */
  name: string;
  modifiedAt?: Date;
  /** Resolves the bytes. Returning null skips the entry, which is how missing media is handled. */
  read: () => Promise<Uint8Array | null>;
};

type CentralRecord = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
};

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
/** Version 2.0, which is all that stored entries require. */
const VERSION = 20;

/**
 * Builds the archive as a stream.
 *
 * Entries are written in order. An entry whose `read` returns null is skipped rather than
 * failing the whole archive, because one missing media object should not cost the user the
 * rest of their export.
 */
export function createZipStream(entries: ZipEntrySource[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const central: CentralRecord[] = [];
  let offset = 0;
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Loops until something is actually enqueued or the archive is finished. Returning
      // from `pull` without enqueuing would leave a pending read waiting forever, because
      // nothing else would trigger another pull.
      while (index < entries.length) {
        const entry = entries[index++];
        const body = await entry.read();
        if (!body) continue;

        const name = encoder.encode(entry.name);
        const { time, date } = dosDateTime(entry.modifiedAt ?? new Date());
        const crc = crc32(body);

        const header = new ByteWriter()
          .u32(LOCAL_HEADER_SIGNATURE)
          .u16(VERSION)
          .u16(0)
          .u16(0) // stored
          .u16(time)
          .u16(date)
          .u32(crc)
          .u32(body.length)
          .u32(body.length)
          .u16(name.length)
          .u16(0)
          .raw(name)
          .toUint8Array();

        central.push({ name, crc, size: body.length, offset, time, date });
        controller.enqueue(header);
        controller.enqueue(body);
        offset += header.length + body.length;
        return;
      }

      const directoryStart = offset;

      const directory = new ByteWriter();
      for (const record of central) {
        directory
          .u32(CENTRAL_HEADER_SIGNATURE)
          .u16(VERSION)
          .u16(VERSION)
          .u16(0)
          .u16(0)
          .u16(record.time)
          .u16(record.date)
          .u32(record.crc)
          .u32(record.size)
          .u32(record.size)
          .u16(record.name.length)
          .u16(0)
          .u16(0)
          .u16(0)
          .u16(0)
          .u32(0)
          .u32(record.offset)
          .raw(record.name);
      }
      const directoryBytes = directory.toUint8Array();

      const end = new ByteWriter()
        .u32(EOCD_SIGNATURE)
        .u16(0)
        .u16(0)
        .u16(central.length)
        .u16(central.length)
        .u32(directoryBytes.length)
        .u32(directoryStart)
        .u16(0)
        .toUint8Array();

      controller.enqueue(directoryBytes);
      controller.enqueue(end);
      controller.close();
    },
  });
}
