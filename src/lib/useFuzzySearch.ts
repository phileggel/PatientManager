import Fuse from "fuse.js";
import { useMemo } from "react";

interface FuzzySearchOptions<T> {
  /** Fuse match-score threshold (0 = exact, 1 = anything). Defaults to 0.3. */
  threshold?: number;
  /**
   * Optional opt-in: items where `item[priorityKey]` is truthy bubble up
   * above falsy ones via a stable secondary sort, preserving Fuse's
   * intra-bucket match-score order.
   */
  priorityKey?: keyof T;
}

/**
 * Generic hook to handle fuzzy search logic using Fuse.js.
 */
export function useFuzzySearch<T>(
  query: string,
  list: T[],
  keys: string[],
  options: FuzzySearchOptions<T> = {},
) {
  const { threshold = 0.3, priorityKey } = options;

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
      const aHas = !!a[priorityKey];
      const bHas = !!b[priorityKey];
      return Number(bHas) - Number(aHas);
    });
  }, [query, fuse, priorityKey]);
}
