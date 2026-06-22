/**
 * Lightweight singleton event bus for cross-component communication.
 *
 * Allows non-React utilities (e.g. uploadAndIndexFile) to signal state changes
 * to mounted React components without direct prop drilling or context coupling.
 *
 * Usage:
 *   // subscribe (returns unsubscribe — use as useEffect cleanup)
 *   useEffect(() => eventBus.on(EVT_DOCUMENTS_UPDATED, myHandler), [myHandler]);
 *
 *   // emit (from anywhere — utility functions, event handlers, etc.)
 *   eventBus.emit(EVT_DOCUMENTS_UPDATED);
 */

type EventHandler = () => void;

const _listeners = new Map<string, Set<EventHandler>>();

export const eventBus = {
  /**
   * Subscribe to an event.
   * Returns an unsubscribe function — pass it directly as the useEffect cleanup.
   */
  on(event: string, handler: EventHandler): () => void {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event)!.add(handler);
    return () => { _listeners.get(event)?.delete(handler); };
  },

  /** Emit an event, synchronously calling every registered handler. */
  emit(event: string): void {
    _listeners.get(event)?.forEach(h => h());
  },
};

/* ── Named event constants ───────────────────────────────────────────────── */

/**
 * Emitted by `uploadAndIndexFile` after any successful upload.
 * Subscribers should call their respective document-refresh function.
 */
export const EVT_DOCUMENTS_UPDATED = 'documentsUpdated';
