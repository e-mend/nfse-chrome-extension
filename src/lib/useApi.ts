import { useCallback, useState, useRef, useEffect } from 'react';
import { silentCloseTab, waitForTabComplete } from './waitForTabComplete';
import type {
  AdnDistribuicaoBody,
  PingAdnOptions,
  PingAdnResult,
  StatusProcessamento,
} from './types';

const ADN_BASE_URL = 'https://adn.nfse.gov.br/contribuintes/DFe';

const ADN_RATE = { lastFetchAt: 0, minDelay: 600, ok: 0, MIN: 500, MAX: 5000 };
const ADN_ZERO_NSU = 0;
const ADN_MAX_ATTEMPTS = 5;
const ADN_TEMPORARY_ERRORS = {
    TOO_MANY_REQUESTS: 429,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
};
const ADN_TEMPORARY_ERROR_NUMBERS: number[] = Object.values(ADN_TEMPORARY_ERRORS);
export const ADN_STATUS_PROCESSAMENTO_ENUM: Record<string, StatusProcessamento> = {
  REJEICAO: 'REJEICAO',
  NENHUM_DOCUMENTO_LOCALIZADO: 'NENHUM_DOCUMENTO_LOCALIZADO',
  DOCUMENTOS_LOCALIZADOS: 'DOCUMENTOS_LOCALIZADOS',
} as const;

async function throttle() {
    const since = Date.now() - ADN_RATE.lastFetchAt;
    if (since < ADN_RATE.minDelay) {
      await new Promise(r => setTimeout(r, ADN_RATE.minDelay - since));
    }
    ADN_RATE.lastFetchAt = Date.now();
  }

export function useApi() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);
  const [lastResult, setLastResult] = useState<number>(0);
  const [forceZeroNow, setForceZeroNow] = useState<boolean>(false);

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    mountedRef.current = false;
    abortRef.current?.abort();
  }, []);

  const forceZero = useCallback(async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const tab = await chrome.tabs.create({
      url: `${ADN_BASE_URL}/${ADN_ZERO_NSU}?lote=true`,
      active: false,
    });
    if (!tab.id) return { ok: false, error: 'Failed to create tab' };

    try {
      await waitForTabComplete(tab.id, { signal: ctrl.signal });
      await new Promise(r => setTimeout(r, 500));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        await silentCloseTab(tab.id);
        return { ok: false, aborted: true };
      }
      throw err;
    }

    await silentCloseTab(tab.id);
    return { ok: true, status: 200 };
  }, []);

  const pingADN = useCallback(
    async (nsu: number, options: PingAdnOptions = {}): Promise<PingAdnResult> => {
      const { onRetry } = options;
      setLoading(true);
      setError(null);
      const url = `${ADN_BASE_URL}/${nsu}?lote=true`;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const timeoutId = setTimeout(() => ctrl.abort(), 15_000);

      let lastTransientStatus = 0;

      try {
        for (let attempt = 0; attempt < ADN_MAX_ATTEMPTS; attempt++) {
          await throttle();
          let response: Response;
          try {
            response = await fetch(url, {
              credentials: 'include',
              cache: 'no-store',
              headers: { Accept: 'application/json' },
              signal: ctrl.signal,
            });
          } catch (err: any) {
            // `fetch` only throws on abort / network / TLS — never on HTTP error
            // statuses, so transient-status handling lives in the response
            // branch below.
            if (err?.name === 'AbortError') {
              if (attempt === 0 && forceZeroNow === false) {
                return {
                  ok: false,
                  certTimeout: true,
                  error:
                    'O certificado não foi escolhido a tempo. Feche o popup do Chrome e clique Conectar de novo.',
                };
              }
              return {
                ok: false,
                timeout: true,
                error: 'O servidor não respondeu a tempo — o ADN pode estar fora do ar.',
              };
            }
            return { ok: false, networkError: true, error: err?.message };
          }

          if (ADN_TEMPORARY_ERROR_NUMBERS.includes(response.status)) {
            lastTransientStatus = response.status;
            const ra = parseInt(response.headers.get('retry-after') || '', 10);
            const wait = Math.min(
              8000,
              !isNaN(ra) ? ra * 1000 : 2000 * Math.pow(2, attempt),
            );
            if (response.status === 429) {
              ADN_RATE.minDelay = Math.min(
                ADN_RATE.MAX,
                Math.round(ADN_RATE.minDelay * 1.5),
              );
              ADN_RATE.ok = 0;
            }
            onRetry?.({
              tentativa: attempt + 1,
              total: ADN_MAX_ATTEMPTS,
              status: response.status,
              aguardarSeg: Math.round(wait / 1000),
            });
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }

          setLastResult(response.status);

          if (!response.ok) {
            return {
              ok: false,
              status: response.status,
              error: `HTTP ${response.status}`,
            };
          }

          const body = (await response.json()) as AdnDistribuicaoBody;
          setData(body);
          if (++ADN_RATE.ok >= 3) {
            ADN_RATE.ok = 0;
            ADN_RATE.minDelay = Math.max(ADN_RATE.MIN, ADN_RATE.minDelay - 50);
          }
          return { ok: true, status: response.status, data: body };
        }

        setForceZeroNow(true);
        return {
          ok: false,
          status: lastTransientStatus || undefined,
          retriesExhausted: true,
          error: 'Esgotadas as tentativas',
        };
      } catch (err: any) {
        setError(err);
        return { ok: false, error: err?.message ?? 'Erro desconhecido' };
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    },
    [forceZeroNow],
  );

  return { pingADN, forceZero, data, loading, error, lastResult, forceZeroNow };
}