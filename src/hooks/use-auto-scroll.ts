'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a scroll container pinned to the bottom while new content arrives,
 * unless the user has scrolled up to read earlier content.
 */
export function useAutoScroll<T extends HTMLElement>(dependency: unknown, threshold = 32) {
  const ref = useRef<T>(null);
  const [pinned, setPinned] = useState(true);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    setPinned(element.scrollHeight - element.scrollTop - element.clientHeight <= threshold);
  }, [threshold]);

  const scrollToBottom = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    setPinned(true);
  }, []);

  useEffect(() => {
    if (pinned && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dependency, pinned]);

  return { ref, pinned, onScroll, scrollToBottom };
}
