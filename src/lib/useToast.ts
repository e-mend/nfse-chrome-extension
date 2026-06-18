import { useRef, useCallback } from 'react';
import type { Toast } from 'primereact/toast';

type Severity = 'success' | 'info' | 'warn' | 'error';

export function useToast() {
  const toastRef = useRef<Toast>(null);
  
  const showToast = useCallback(
    (severity: Severity, summary: string, detail: string, life: number = 4000) => {
      toastRef.current?.show({ severity, summary, detail, life });
    },
    [],
  );

  return {
    toastRef,
    showToast,
  };
}