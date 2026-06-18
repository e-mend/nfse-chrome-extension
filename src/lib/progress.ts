import { useState, useCallback } from 'react';

export interface ProgressState {
  visible: boolean;
  /** Indeterminate animation when fetching unknown total. */
  busy: boolean;
  label: string;
  count: string;
  /** 0..100; ignored when busy is true. */
  percent: number;
}

const empty: ProgressState = { visible: false, busy: false, label: '', count: '', percent: 0 };

export function useProgress() {
  const [progress, setProgressState] = useState<ProgressState>(empty);

  const showProgress = useCallback((visible: boolean) => {
    setProgressState((prev) => ({ ...prev, visible }));
  }, []);

  const setProgressBusy = useCallback((busy: boolean) => {
    setProgressState((prev) => ({ ...prev, busy }));
  }, []);

  const setProgress = useCallback((label: string, count = '', percent = 0) => {
    setProgressState((prev) => ({ ...prev, visible: true, label, count, percent }));
  }, []);

  const resetProgress = useCallback(() => setProgressState(empty), []);

  return { progress, showProgress, setProgressBusy, setProgress, resetProgress };
}
