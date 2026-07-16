import { useCallback, useState } from 'react';
import { localStorageKit } from './create-storage';
import type { StorageWriteOptions } from './types';

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  options?: StorageWriteOptions & { version?: number },
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorageKit.getJson<T>(key, { version: options?.version });
    return stored ?? defaultValue;
  });

  const setPersistent = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        localStorageKit.setJson(key, resolved, {
          version: options?.version ?? 1,
          ttlMs: options?.ttlMs,
        });
        return resolved;
      });
    },
    [key, options?.ttlMs, options?.version],
  );

  return [value, setPersistent];
}
