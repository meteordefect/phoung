import { useEffect } from 'react';
import { eventBus, type BusEvent } from './eventBus';

export function useEventBus(event: BusEvent, handler: (payload?: any) => void) {
  useEffect(() => {
    return eventBus.on(event, handler);
  }, [event, handler]);
}
