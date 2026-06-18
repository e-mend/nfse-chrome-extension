import { useState, useCallback } from 'react';

export type StatusKind = 'info' | 'success' | 'warn' | 'error';

export interface StatusState {
  kind: StatusKind | null;
  message: string;
  /** When true, the StatusMessage component shows the spinning indicator. */
  busy: boolean;
}

const empty: StatusState = { kind: null, message: '', busy: false };

/**
 * Small `setStatus(msg, tipo, busy?)` helper. Returns the current status plus
 * stable setters that any
 * component can call. Logic layer will rewrite the call sites; the React tree
 * just consumes `status` from a top-level state and threads `setStatus` down
 * (or, if it grows, this can be lifted into a context).
 */
export function useStatus() {
  const [status, setStatusState] = useState<StatusState>(empty);

  const setStatus = useCallback((message: string, kind: StatusKind = 'info', busy = false) => {
    setStatusState({ message, kind, busy });
  }, []);

  const clearStatus = useCallback(() => setStatusState(empty), []);

  return { status, setStatus, clearStatus };
}
