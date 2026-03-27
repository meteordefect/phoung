import { useRef, useLayoutEffect } from 'react';

export function usePreserveScroll<T>(data: T) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number>(0);
  const prevData = useRef<T>(data);

  if (data !== prevData.current) {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    prevData.current = data;
  }

  useLayoutEffect(() => {
    if (scrollRef.current && savedScrollTop.current > 0) {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  });

  return scrollRef;
}
