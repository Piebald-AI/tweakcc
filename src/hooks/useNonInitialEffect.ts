import { useEffect, useRef, DependencyList, EffectCallback } from 'react';

/**
 * A custom hook that works like useEffect but skips execution on the initial mount.
 * Only runs the effect when dependencies change after the first render.
 */
export function useNonInitialEffect(
  effect: EffectCallback,
  deps?: DependencyList
) {
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    return effect();
  }, deps);
}
