import Fuse from "fuse.js";
import { useMemo } from "react";

/**
 * Generic hook to handle fuzzy search logic using Fuse.js.
 *
 * Optional `priorityKey`: name of a boolean-ish field on the item. After Fuse
 * ranks by match score, items where `item[priorityKey]` is truthy bubble up
 * via a stable secondary sort, preserving Fuse's intra-bucket ordering.
 */
export function useFuzzySearch<T>(
  query: string,
  list: T[],
  keys: string[],
  threshold = 0.3,
  priorityKey?: string,
) {
  const fuse = useMemo(() => {
    return new Fuse(list, {
      keys,
      threshold,
      distance: 100,
    });
  }, [list, keys, threshold]);

  return useMemo(() => {
    // We only start searching after 2 characters for better performance
    if (query.length < 2) {
      return [];
    }

    const ranked = fuse.search(query).map((result) => result.item);
    if (!priorityKey) return ranked;

    return [...ranked].sort((a, b) => {
      const aHas = !!(a as Record<string, unknown>)[priorityKey];
      const bHas = !!(b as Record<string, unknown>)[priorityKey];
      return Number(bHas) - Number(aHas);
    });
  }, [query, fuse, priorityKey]);
}
