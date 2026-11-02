// A plate is several stencils printed together. plate3mf() lays them out on the bed and writes them
// as one 3MF file, the format Bambu Studio and other slicers open with every part already placed.

/** One stencil on the plate: the exact STL that Download STL saves, and the name the slicer shows. */
export interface PlatePart { name: string; stl: ArrayBuffer }

// packPlate() places parts in rows from the bed's front-left corner. Each part keeps its orientation,
// and the finished layout is centred on the bed. It returns each part's front-left corner, or null
// when the parts do not fit inside the bed minus margin on every side.
// ponytail: rows in the order given, with no rotation or reordering. Smarter packing can come if plates fill up.
export function packPlate(sizes: [number, number][], bedW: number, bedD: number, gap: number, margin = 3): [number, number][] | null {
  const maxW = bedW - 2 * margin, maxD = bedD - 2 * margin;
  const at: [number, number][] = [];
  let x = 0, y = 0, rowD = 0, layoutW = 0;
  for (const [w, d] of sizes) {
    if (w > maxW) return null;
    if (x > 0 && x + w > maxW) { y += rowD + gap; x = 0; rowD = 0; }
    at.push([x, y]);
    x += w + gap; rowD = Math.max(rowD, d); layoutW = Math.max(layoutW, x - gap);
  }
  const layoutD = y + rowD;
  if (layoutD > maxD) return null;
  const ox = (bedW - layoutW) / 2, oy = (bedD - layoutD) / 2;
  return at.map(([px, py]) => [px + ox, py + oy]);
}

/** A binary STL's width, depth, and height in mm, read from its corners. */
export function stlSize(stl: ArrayBuffer): [number, number, number] {
  const dv = new DataView(stl), n = dv.getUint32(80, true);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) {
    const c = dv.getFloat32(84 + t * 50 + 12 + v * 12 + a * 4, true);
    if (c < min[a]) min[a] = c;
    if (c > max[a]) max[a] = c;
  }
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

export interface Mesh { vertices: Float32Array; triangles: Uint32Array; min: number[]; max: number[] }

// stlMesh() reads a binary STL into a vertex list and triangle indices. An STL repeats each corner in
// every triangle that uses it, and a 3MF lists it once, which keeps the file a fraction of the size.
export function stlMesh(stl: ArrayBuffer): Mesh {
  const dv = new DataView(stl), n = dv.getUint32(80, true);
  const index = new Map<string, number>(), verts: number[] = [], triangles = new Uint32Array(n * 3);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) {
    const o = 84 + t * 50 + 12 + v * 12;
    const p = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
    const key = p.join(',');
    let id = index.get(key);
    if (id === undefined) {
      id = verts.length / 3; index.set(key, id); verts.push(...p);
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p[a]); max[a] = Math.max(max[a], p[a]); }
    }
    triangles[t * 3 + v] = id;
  }
  return { vertices: new Float32Array(verts), triangles, min, max };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The CRC-32 checksum that zip files store for each entry. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const deflate = async (data: Uint8Array) =>
  new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

// zipFiles() writes a zip archive with every entry deflated, using the CompressionStream that
// browsers have built in. A 3MF file is a zip with a fixed set of entries.
async function zipFiles(files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const enc = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), packed = await deflate(f.data), crc = crc32(f.data);
    // Every entry is dated 1 January 1980, the earliest date a zip can hold, so the same plate always gives the same bytes.
    const head = (size: number, sig: number) => { const b = new Uint8Array(size), d = new DataView(b.buffer); d.setUint32(0, sig, true); return [b, d] as const; };
    const [lh, l] = head(30 + name.length, 0x04034b50);
    l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 8, true); l.setUint16(12, 33, true);
    l.setUint32(14, crc, true); l.setUint32(18, packed.length, true); l.setUint32(22, f.data.length, true);
    l.setUint16(26, name.length, true); lh.set(name, 30);
    const [ch, c] = head(46 + name.length, 0x02014b50);
    c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, packed.length, true); c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); ch.set(name, 46);
    local.push(lh, packed); central.push(ch);
    offset += lh.length + packed.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const b of [...local, ...central, end]) { out.set(b, p); p += b.length; }
  return out;
}

const xmlName = (s: string) => s.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const mm = (v: number) => String(Math.round(v * 1e4) / 1e4);

// plate3mf() lays the parts out on a bedW × bedD bed with gap mm between them, and writes the 3MF.
// Each part keeps the orientation its STL has, so a flat sheet stays rotated to fit and a shell
// stays upright. It returns null when the parts do not fit the bed.
export async function plate3mf(parts: PlatePart[], bedW: number, bedD: number, gap = 10): Promise<Uint8Array | null> {
  const meshes = parts.map((p) => stlMesh(p.stl));
  const at = packPlate(meshes.map((m) => [m.max[0] - m.min[0], m.max[1] - m.min[1]]), bedW, bedD, gap);
  if (!at) return null;
  const objects: string[] = [], items: string[] = [];
  meshes.forEach((m, i) => {
    // Each object starts at the origin, and its build item moves it to its place on the bed.
    const v: string[] = [], t: string[] = [];
    for (let k = 0; k < m.vertices.length; k += 3)
      v.push(`<vertex x="${mm(m.vertices[k] - m.min[0])}" y="${mm(m.vertices[k + 1] - m.min[1])}" z="${mm(m.vertices[k + 2] - m.min[2])}"/>`);
    for (let k = 0; k < m.triangles.length; k += 3) t.push(`<triangle v1="${m.triangles[k]}" v2="${m.triangles[k + 1]}" v3="${m.triangles[k + 2]}"/>`);
    objects.push(`<object id="${i + 1}" name="${xmlName(parts[i].name)}" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`);
    items.push(`<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${mm(at[i][0])} ${mm(at[i][1])} 0"/>`);
  });
  const enc = new TextEncoder();
  return zipFiles([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
    { name: '3D/3dmodel.model', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" '
      + `xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects.join('')}</resources><build>${items.join('')}</build></model>`) },
  ]);
}
