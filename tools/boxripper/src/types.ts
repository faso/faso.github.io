// Shared app types.

import type { Pt } from './rectify';

export type FaceKey = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export const FACE_KEYS: FaceKey[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export const FACE_LABELS: Record<FaceKey, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

// For unseen sides: the face a copy duplicates from.
export const FACE_OPPOSITE: Record<FaceKey, FaceKey> = {
  front: 'back',
  back: 'front',
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

export interface FaceState {
  photoId: string | null; // source photo when capturing
  points: Pt[] | null; // 4 corners in source-image pixels (TL,TR,BR,BL)
  copyFrom: FaceKey | null; // when set, duplicate that face instead of capturing
  mirror: boolean; // mirror horizontally when copying
  rotate: number; // 90° clockwise quarter-turns applied to the final texture (0-3)
}

export interface DitherSettings {
  mode: 'palette' | 'bw';
  paletteSize: number; // adaptive (median-cut) colors in palette mode
  downscale: number; // target longest texture edge, px
  algorithm: 'floyd' | 'atkinson' | 'none';
}

export interface Dims {
  w: number;
  h: number;
  d: number;
}

export interface Project {
  faces: Record<FaceKey, FaceState>;
  dither: DitherSettings;
  dims: Dims;
}

export function emptyFace(): FaceState {
  return { photoId: null, points: null, copyFrom: null, mirror: false, rotate: 0 };
}

export function defaultProject(): Project {
  return {
    faces: {
      front: emptyFace(),
      back: emptyFace(),
      left: emptyFace(),
      right: emptyFace(),
      top: emptyFace(),
      bottom: emptyFace(),
    },
    dither: { mode: 'palette', paletteSize: 16, downscale: 192, algorithm: 'floyd' },
    dims: { w: 1, h: 1, d: 1 },
  };
}
