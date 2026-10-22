import type { FaceKey, Project } from './types';

/** A face can copy a chain of other faces, but never depend on itself. */
export function wouldCreateCopyCycle(project: Project, target: FaceKey, source: FaceKey): boolean {
  const seen = new Set<FaceKey>([target]);
  let current: FaceKey | null = source;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = project.faces[current].copyFrom;
  }
  return false;
}
