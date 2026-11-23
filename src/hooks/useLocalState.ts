import { useEffect, useState } from 'react';

/**
 * useState mit lokaler Persistenz (localStorage). Fällt still auf reinen
 * Speicher-State zurück, wenn localStorage nicht verfügbar ist.
 */
export function useLocalState<T>(key: string, initial: () => T, isValid?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (!isValid || isValid(parsed)) return parsed as T;
      }
    } catch {
      /* ignore */
    }
    return initial();
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
