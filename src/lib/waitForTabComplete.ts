export function waitForTabComplete(
    tabId: number,
    { timeoutMs = 60_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}
  ): Promise<'complete' | 'closed' | 'timeout'> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
        if (id === tabId && info.status === 'complete') { cleanup(); resolve('complete'); }
      };
      const onRemoved = (id: number) => {
        if (id === tabId) { cleanup(); resolve('closed'); }
      };
      const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { cleanup(); resolve('timeout'); }, timeoutMs);
  
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
      signal?.addEventListener('abort', onAbort);
  
      // race guard: tab may already be complete before listeners attached
      chrome.tabs.get(tabId).then(t => {
        if (t.status === 'complete') { cleanup(); resolve('complete'); }
      }).catch(() => { cleanup(); resolve('closed'); });
    });
}
  
export async function silentCloseTab(id: number) {
    try { await chrome.tabs.remove(id); } catch {}
}