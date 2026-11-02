import type { PieceMode } from '../ui/Piece3D';

// The 3D view's mode lives in Preview. Preview registers its setter here, so the Claude bridge can switch it before a screenshot.
let setter: ((m: PieceMode) => void) | null = null;
export const registerViewMode = (f: ((m: PieceMode) => void) | null) => { setter = f; };
export const setViewMode = (m: PieceMode) => setter?.(m);
