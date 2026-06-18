/**
 * Shared types for the certificate UI.
 *
 * These mirror the `detected` / `nsuPorEmpresa` shapes so the logic layer
 * plugs in cleanly.
 */

export interface DetectedEmpresa {
  cnpj: string;
  nome: string;
  prevNSU: number | null;
  cnpjConsulta: string;
}

export type OrgNome = 'num' | 'datanum';
export type OrgSub = 'anoMesTipo' | 'tipoAnoMes' | 'tipo';

export type RelTipo = 'Emitidas' | 'Recebidas';

// ─── ADN / DFe API ─────────────────────────────────────────────────────────
// Shape of GET https://adn.nfse.gov.br/contribuintes/DFe/{nsu}?lote=true.
// The 200, 400 and 404 responses share the same schema (only the values of
// StatusProcessamento and the populated arrays differ).

export type StatusProcessamento =
  | 'REJEICAO'
  | 'NENHUM_DOCUMENTO_LOCALIZADO'
  | 'DOCUMENTOS_LOCALIZADOS';

export type TipoAmbiente = 'PRODUCAO' | 'HOMOLOGACAO';

/** Generic carrier the ADN uses for both `Alertas` and `Erros`. */
export interface MensagemProcessamento {
  Codigo?: string;
  Descricao?: string;
  [key: string]: unknown;
}

/**
 * One entry of the `LoteDFe` array (NSU + document payload).
 *
 * The ADN sometimes returns `NSU` as a number and sometimes as a string,
 * depending on the document/route — we accept both and normalize at the call
 * site. `ArquivoXml` is a gzip+base64 blob; events / "resumo-only" entries
 * may omit it (we skip those when persisting).
 */
export interface DistribuicaoNSU {
  NSU?: string | number;
  ArquivoXml?: string;
  TipoDocumento?: string;
  ChaveAcesso?: string;
  [key: string]: unknown;
}

export interface AdnDistribuicaoBody {
  StatusProcessamento: StatusProcessamento;
  LoteDFe: DistribuicaoNSU[] | null;
  Alertas: MensagemProcessamento[] | null;
  Erros: MensagemProcessamento[] | null;
  TipoAmbiente: TipoAmbiente;
  VersaoAplicativo: string | null;
  DataHoraProcessamento: string;
}

/** Payload delivered to the UI on every transient-error retry. */
export interface PingAdnRetryInfo {
  tentativa: number;
  total: number;
  status: number;
  aguardarSeg: number;
}

export interface PingAdnOptions {
  /** Notified when a transient HTTP status (429/502/503/504) triggers a backoff. */
  onRetry?: (info: PingAdnRetryInfo) => void;
}

export interface PingAdnSuccess {
  ok: true;
  status: number;
  data: AdnDistribuicaoBody;
}

export interface PingAdnFailure {
  ok: false;
  status?: number;
  error?: string;
  certTimeout?: boolean;
  timeout?: boolean;
  networkError?: boolean;
  retriesExhausted?: boolean;
  aborted?: boolean;
}

export type PingAdnResult = PingAdnSuccess | PingAdnFailure;
