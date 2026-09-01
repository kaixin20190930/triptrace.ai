export type ExtractedExif = {
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Endian = "little" | "big";

type IfdEntry = {
  tag: number;
  type: number;
  count: number;
  valueOffset: number;
  entryOffset: number;
};

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

function readU16(view: DataView, offset: number, endian: Endian) {
  return view.getUint16(offset, endian === "little");
}

function readU32(view: DataView, offset: number, endian: Endian) {
  return view.getUint32(offset, endian === "little");
}

function readAscii(view: DataView, offset: number, length: number) {
  let value = "";
  for (let i = 0; i < length; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    value += String.fromCharCode(code);
  }
  return value.trim();
}

function entryDataOffset(entry: IfdEntry, tiffOffset: number) {
  const size = (TYPE_SIZE[entry.type] || 1) * entry.count;
  return size <= 4 ? entry.entryOffset + 8 : tiffOffset + entry.valueOffset;
}

function readIfd(view: DataView, tiffOffset: number, ifdOffset: number, endian: Endian) {
  const absoluteOffset = tiffOffset + ifdOffset;
  if (absoluteOffset < 0 || absoluteOffset + 2 > view.byteLength) return [];
  const count = readU16(view, absoluteOffset, endian);
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i++) {
    const entryOffset = absoluteOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    entries.push({
      tag: readU16(view, entryOffset, endian),
      type: readU16(view, entryOffset + 2, endian),
      count: readU32(view, entryOffset + 4, endian),
      valueOffset: readU32(view, entryOffset + 8, endian),
      entryOffset,
    });
  }
  return entries;
}

function findEntry(entries: IfdEntry[], tag: number) {
  return entries.find((entry) => entry.tag === tag);
}

function readEntryAscii(view: DataView, entry: IfdEntry | undefined, tiffOffset: number) {
  if (!entry) return null;
  const offset = entryDataOffset(entry, tiffOffset);
  if (offset < 0 || offset >= view.byteLength) return null;
  return readAscii(view, offset, entry.count);
}

function readEntryU32(view: DataView, entry: IfdEntry | undefined, endian: Endian, tiffOffset: number) {
  if (!entry) return null;
  const offset = entryDataOffset(entry, tiffOffset);
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return readU32(view, offset, endian);
}

function readRational(view: DataView, offset: number, endian: Endian) {
  if (offset < 0 || offset + 8 > view.byteLength) return null;
  const numerator = readU32(view, offset, endian);
  const denominator = readU32(view, offset + 4, endian);
  if (!denominator) return null;
  return numerator / denominator;
}

function readGpsCoordinate(view: DataView, entry: IfdEntry | undefined, ref: string | null, endian: Endian, tiffOffset: number) {
  if (!entry || entry.count < 3) return null;
  const offset = entryDataOffset(entry, tiffOffset);
  const degrees = readRational(view, offset, endian);
  const minutes = readRational(view, offset + 8, endian);
  const seconds = readRational(view, offset + 16, endian);
  if (degrees === null || minutes === null || seconds === null) return null;
  const sign = ref === "S" || ref === "W" ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function parseExifDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000`;
}

function parseTiff(view: DataView, tiffOffset: number): ExtractedExif {
  const endianMarker = readAscii(view, tiffOffset, 2);
  const endian: Endian | null = endianMarker === "II" ? "little" : endianMarker === "MM" ? "big" : null;
  if (!endian) return { capturedAt: null, latitude: null, longitude: null };
  if (readU16(view, tiffOffset + 2, endian) !== 42) return { capturedAt: null, latitude: null, longitude: null };

  const ifd0Offset = readU32(view, tiffOffset + 4, endian);
  const ifd0 = readIfd(view, tiffOffset, ifd0Offset, endian);
  const exifOffset = readEntryU32(view, findEntry(ifd0, 0x8769), endian, tiffOffset);
  const gpsOffset = readEntryU32(view, findEntry(ifd0, 0x8825), endian, tiffOffset);

  const exifIfd = exifOffset ? readIfd(view, tiffOffset, exifOffset, endian) : [];
  const gpsIfd = gpsOffset ? readIfd(view, tiffOffset, gpsOffset, endian) : [];

  const date =
    readEntryAscii(view, findEntry(exifIfd, 0x9003), tiffOffset) ||
    readEntryAscii(view, findEntry(exifIfd, 0x9004), tiffOffset) ||
    readEntryAscii(view, findEntry(ifd0, 0x0132), tiffOffset);

  const latRef = readEntryAscii(view, findEntry(gpsIfd, 0x0001), tiffOffset);
  const lonRef = readEntryAscii(view, findEntry(gpsIfd, 0x0003), tiffOffset);
  const latitude = readGpsCoordinate(view, findEntry(gpsIfd, 0x0002), latRef, endian, tiffOffset);
  const longitude = readGpsCoordinate(view, findEntry(gpsIfd, 0x0004), lonRef, endian, tiffOffset);

  return {
    capturedAt: parseExifDate(date),
    latitude,
    longitude,
  };
}

function parseJpegExif(view: DataView): ExtractedExif {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return { capturedAt: null, latitude: null, longitude: null };
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const segmentLength = view.getUint16(offset + 2);
    const segmentStart = offset + 4;
    const segmentEnd = offset + 2 + segmentLength;
    if (segmentEnd > view.byteLength) break;

    if (marker === 0xe1 && readAscii(view, segmentStart, 6) === "Exif") {
      return parseTiff(view, segmentStart + 6);
    }

    offset = segmentEnd;
  }

  return { capturedAt: null, latitude: null, longitude: null };
}

export async function extractExif(file: File): Promise<ExtractedExif> {
  if (!file.type.includes("jpeg") && !file.type.includes("jpg") && !file.name.toLowerCase().match(/\.jpe?g$/)) {
    return { capturedAt: null, latitude: null, longitude: null };
  }

  try {
    const buffer = await file.arrayBuffer();
    return parseJpegExif(new DataView(buffer));
  } catch {
    return { capturedAt: null, latitude: null, longitude: null };
  }
}
