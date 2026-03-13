import { useEffect, useState, useRef, useCallback } from 'react';
import { eventBus, type BusEvent } from '../lib/eventBus';

interface PollingOptions<T> {
  getSignature?: (data: T) => string;
  busEvents?: BusEvent[];
}

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  interval: number = 5000,
  enabled: boolean = true,
  options?: PollingOptions<T>
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const fetchFnRef = useRef(fetchFn);
  const signatureRef = useRef<string>('');
  const getSignatureRef = useRef(options?.getSignature);
  fetchFnRef.current = fetchFn;
  getSignatureRef.current = options?.getSignature;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetchFnRef.current();
      const getSig = getSignatureRef.current;
      if (getSig && result != null) {
        const sig = getSig(result);
        if (sig === signatureRef.current) {
          setLoading(false);
          return;
        }
        signatureRef.current = sig;
      }
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (interval > 0) {
      intervalRef.current = window.setInterval(doFetch, interval);
    }
  }, [interval, doFetch]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    doFetch();
    startInterval();

    const busUnsubs: (() => void)[] = [];
    if (options?.busEvents) {
      for (const ev of options.busEvents) {
        busUnsubs.push(eventBus.on(ev, () => doFetch()));
      }
    }

    let debounceTimer: number | null = null;
    const handleVisibility = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          doFetch();
          startInterval();
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibility);
      if (debounceTimer) clearTimeout(debounceTimer);
      busUnsubs.forEach(fn => fn());
    };
  }, [interval, enabled, doFetch, startInterval, stopInterval]);

  const refetch = useCallback(() => {
    setLoading(true);
    doFetch();
  }, [doFetch]);

  return { data, error, loading, refetch };
}
