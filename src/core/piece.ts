/** Fraction of the paint texture's height kept as plain clay at the top and bottom edges. */
export const TEX_PAD = 0.03;

/**
 * A round piece described by its outside profile, from the base (or a plate's well edge) up to the rim.
 * z is the height above the table and d the outside diameter at that height, both in mm.
 */
export interface Piece { name: string; profile: { z: number; d: number }[] }

/** Cumulative distance along the surface at each profile point, in mm. */
function surfaceAt(piece: Piece): number[] {
  const s = [0];
  for (let i = 1; i < piece.profile.length; i++) {
    const a = piece.profile[i - 1], b = piece.profile[i];
    s.push(s[i - 1] + Math.hypot(b.z - a.z, (b.d - a.d) / 2));
  }
  return s;
}

/** Length of the piece's surface from base to rim, as a tape measure would follow it, in mm. */
export const surfaceLength = (piece: Piece) => surfaceAt(piece).at(-1) ?? 0;

/** Diameter at a distance along the surface from the base, interpolated between profile points. */
export function diameterAt(piece: Piece, s: number): number {
  const ss = surfaceAt(piece), p = piece.profile;
  if (s <= 0) return p[0].d;
  for (let i = 1; i < p.length; i++) {
    if (s <= ss[i]) return p[i - 1].d + ((p[i].d - p[i - 1].d) * (s - ss[i - 1])) / (ss[i] - ss[i - 1] || 1);
  }
  return p[p.length - 1].d;
}

export interface BandOptions {
  /** The paint band's edges, in mm along the surface from the base. */
  from: number; to: number;
  /** Plastic margins above the band, below it, and past its two ends, in mm. */
  above: number; below: number; ends: number;
  /** Runs the bottom margin all the way down to the base, so the stencil sits on the table. */
  toBase: boolean;
}

export interface Band {
  /** Diameters at the band's bottom and top edges, and its length along the surface, in mm. */
  botD: number; topD: number; slant: number;
  frame: number; frameTop: number; frameBottom: number;
  /** Where the band starts, in mm along the surface from the base. */
  start: number;
  /** How far the curved wall moves away from the flat stencil anywhere under it, in mm. */
  curve: number;
}

// bandOnPiece() fits the flat stencil to the piece. A flat sheet only lies flush on a cone,
// so it uses the cone through the two ends of the surface the stencil covers. curve says how
// far a bellied or waisted wall strays from that cone.
export function bandOnPiece(piece: Piece, o: BandOptions): Band {
  const S = surfaceLength(piece);
  const s0 = Math.min(Math.max(0, o.from), S - 1), s1 = Math.min(Math.max(s0 + 1, o.to), S);
  const frameBottom = o.toBase ? s0 : o.below;
  const sA = Math.max(0, s0 - frameBottom), sB = Math.min(S, s1 + o.above);
  const dA = diameterAt(piece, sA), dB = diameterAt(piece, sB);
  const cone = (s: number) => dA + ((dB - dA) * (s - sA)) / (sB - sA || 1);
  let curve = 0;
  for (const s of surfaceAt(piece)) if (s > sA && s < sB) curve = Math.max(curve, Math.abs(diameterAt(piece, s) - cone(s)) / 2);
  return { botD: cone(s0), topD: cone(s1), slant: s1 - s0, frame: o.ends, frameTop: o.above, frameBottom, start: s0, curve };
}

/** One point of the piece's cross-section for the 3D model. r is the radius and z the height, in mm.
 *  v is the texture row: TEX_PAD to 1 - TEX_PAD runs up the painted surface from base to rim.
 *  Every point after the rim uses v = 1, because rows interpolate between neighbouring points
 *  and a run from 1 back to 0 would sweep the pattern across the inside. */
export interface ProfilePoint { r: number; z: number; v: number }

export interface Profile { points: ProfilePoint[]; flat: boolean }

// pieceProfile() builds the piece's cross-section for a lathe (surface-of-revolution) mesh.
// A steep piece becomes a vessel with a rim, an inner wall and a floor. A shallow one becomes
// a plate, painted on top, with a centre well and a thickness underneath.
export function pieceProfile(piece: Piece, wall = 4): Profile {
  const ss = surfaceAt(piece), S = ss.at(-1) || 1, p = piece.profile;
  const surface = p.map((q, i) => ({ r: q.d / 2, z: q.z, v: TEX_PAD + (ss[i] / S) * (1 - 2 * TEX_PAD) }));
  const height = p[p.length - 1].z - p[0].z, rim = surface[surface.length - 1], base = surface[0];
  const flat = height < S * 0.5;
  if (flat) {
    return {
      flat,
      points: [
        { r: 0, z: base.z, v: 0 }, ...surface,
        { r: rim.r, z: rim.z - wall, v: 1 }, { r: base.r, z: base.z - wall, v: 1 }, { r: 0, z: base.z - wall, v: 1 },
      ],
    };
  }
  // The inner wall runs parallel to the outer one, a wall's thickness in.
  const inner = [...surface].reverse().map((q) => ({ r: Math.max(1, q.r - wall), z: Math.max(base.z + wall, q.z), v: 1 }));
  return { flat, points: [{ r: 0, z: base.z, v: 0 }, ...surface, ...inner, { r: 0, z: base.z + wall, v: 1 }] };
}
