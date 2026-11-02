import { describe, expect, test } from 'vitest';
import { crc32, packPlate, plate3mf, stlMesh, stlSize } from './plate';
import { meshSTL } from './mesh';

// A 20 × 10 px sheet at 0.5 mm per pixel (10 × 5 mm), 0.6 mm thick, with one hole.
function sheetStl(): ArrayBuffer {
  const w = 20, h = 10, solid = new Uint8Array(w * h).fill(1);
  solid[5 * w + 5] = 0;
  return meshSTL(solid, w, h, 0.5, 0.6);
}

// unzip() reads back a zip that zipFiles() wrote: every entry is deflated, sizes sit in the headers.
async function unzip(bytes: Uint8Array): Promise<Map<string, { text: string; crc: number; storedCrc: number }>> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Map();
  let o = 0;
  while (dv.getUint32(o, true) === 0x04034b50) {
    const storedCrc = dv.getUint32(o + 14, true), csize = dv.getUint32(o + 18, true), nlen = dv.getUint16(o + 26, true), xlen = dv.getUint16(o + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 30, o + 30 + nlen));
    const data = bytes.subarray(o + 30 + nlen + xlen, o + 30 + nlen + xlen + csize);
    const raw = new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    out.set(name, { text: new TextDecoder().decode(raw), crc: crc32(raw), storedCrc });
    o += 30 + nlen + xlen + csize;
  }
  expect(dv.getUint32(o, true)).toBe(0x02014b50); // the central directory follows the entries
  return out;
}

describe('packPlate', () => {
  test('lays parts out in rows with a gap, centred on the bed', () => {
    const at = packPlate([[136.7, 55.1], [136.7, 55.1], [136.7, 55.1]], 256, 256, 10)!;
    expect(at).toHaveLength(3);
    for (const [x, y] of at) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x + 136.7).toBeLessThanOrEqual(256);
      expect(y).toBeGreaterThanOrEqual(0); expect(y + 55.1).toBeLessThanOrEqual(256);
    }
    const ys = at.map(([, y]) => y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(55.1 + 10);
    // The layout is centred, so the space above the top row matches the space below the bottom row.
    expect(ys[0]).toBeCloseTo(256 - (ys[2] + 55.1));
  });

  test('puts small parts side by side before it starts a new row', () => {
    const at = packPlate([[70, 40], [70, 40], [70, 40]], 256, 256, 10)!;
    expect(new Set(at.map(([, y]) => y)).size).toBe(1);
  });

  test('returns null when the parts do not fit', () => {
    expect(packPlate([[136.7, 55.1], [136.7, 55.1], [136.7, 55.1], [136.7, 55.1]], 256, 256, 10)).toBeNull();
    expect(packPlate([[300, 10]], 256, 256, 10)).toBeNull();
  });
});

describe('stlMesh', () => {
  test('shares the corners that STL triangles repeat, and measures the part', () => {
    const stl = sheetStl(), n = new DataView(stl).getUint32(80, true), mesh = stlMesh(stl);
    expect(mesh.triangles.length / 3).toBe(n);
    expect(mesh.vertices.length / 3).toBeLessThan(n);
    expect(mesh.max[0] - mesh.min[0]).toBeCloseTo(10);
    expect(mesh.max[2] - mesh.min[2]).toBeCloseTo(0.6);
  });
});

test('stlSize measures a part without building its mesh', () => {
  const [w, d, h] = stlSize(sheetStl());
  expect(w).toBeCloseTo(10); expect(d).toBeCloseTo(5); expect(h).toBeCloseTo(0.6);
});

describe('plate3mf', () => {
  test('writes a 3MF with one object and one placed build item per part', async () => {
    const zip = await plate3mf([{ name: 'Floral', stl: sheetStl() }, { name: 'Chevron', stl: sheetStl() }], 256, 256);
    const files = await unzip(zip!);
    expect([...files.keys()].sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
    for (const f of files.values()) expect(f.crc).toBe(f.storedCrc);
    const model = files.get('3D/3dmodel.model')!.text;
    expect(model.match(/<object /g)).toHaveLength(2);
    expect(model.match(/<item /g)).toHaveLength(2);
    expect(model).toContain('name="Chevron"');
    expect(model).toContain('unit="millimeter"');
  });

  test('returns null when the parts do not fit the bed', async () => {
    expect(await plate3mf([{ name: 'Big', stl: sheetStl() }], 8, 8)).toBeNull();
  });
});

test('crc32 matches the standard check value', () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
});
