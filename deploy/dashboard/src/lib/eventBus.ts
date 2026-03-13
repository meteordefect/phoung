type EventCallback = (payload?: any) => void;

const listeners = new Map<string, Set<EventCallback>>();

export const eventBus = {
  on(event: string, cb: EventCallback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
    return () => { listeners.get(event)?.delete(cb); };
  },

  emit(event: string, payload?: any) {
    listeners.get(event)?.forEach(cb => cb(payload));
  },

  off(event: string, cb: EventCallback) {
    listeners.get(event)?.delete(cb);
  },
};

export type BusEvent =
  | 'task:updated'
  | 'agent:status'
  | 'chat:message'
  | 'pr:merged'
  | 'session:changed'
  | 'counts:updated';
