
interface MemoryComposition {
  photoCount: number;
  gifCount: number;
  noteCount: number;
}

/**
 * Validates the allowed content combinations inside a memory pin.
 */
export function validateMemoryComposition({
  photoCount,
  gifCount,
  noteCount,
}: MemoryComposition): void {
  const hasInvalidCounts =
    photoCount < 0 ||
    photoCount > 3 ||
    gifCount < 0 ||
    gifCount > 1 ||
    noteCount < 0 ||
    noteCount > 2;

  const hasExclusiveGif =
    gifCount === 1 && (photoCount > 0 || noteCount > 0);

  const hasInvalidPhotoNoteCombination =
    photoCount > 0 &&
    noteCount > 0 &&
    (photoCount > 2 || noteCount > 1);

  if (
    hasInvalidCounts ||
    hasExclusiveGif ||
    hasInvalidPhotoNoteCombination
  ) {
    throw new Error("MEMORY_COMPOSITION_INVALID");
  }
}
