import type { NfseMeta, NfseParty } from './useXml';

/**
 * Per-CNPJ/CPF accumulator. `docs` is *coverage* (how many documents the
 * party appears in, regardless of role); the role counters power the
 * tiebreakers in {@link rankTally}.
 */
export interface OwnerTallyEntry {
  /** Digits-only CNPJ (14) or CPF (11) — also the tally map key. */
  doc: string;
  docs: number;
  asPrest: number;
  asToma: number;
  /** First non-empty razão social / nome seen for this party. */
  nome: string;
}

export interface OwnerDetection {
  owner: OwnerTallyEntry;
  /** Coverage tie that the heuristic couldn't break cleanly — log, don't surface. */
  ambiguous: boolean;
  runnerUp: OwnerTallyEntry | null;
}

type Role = 'prest' | 'toma';

const PARTY_ROLES: ReadonlyArray<{ pick: (m: NfseMeta) => NfseParty; role: Role }> = [
  { pick: (m) => m.prestador, role: 'prest' },
  { pick: (m) => m.tomador, role: 'toma' },
];

const isValidDoc = (doc: string): boolean => doc.length === 11 || doc.length === 14;

const bothSides = (e: OwnerTallyEntry): boolean => e.asPrest > 0 && e.asToma > 0;

function bumpTally(
  tally: Map<string, OwnerTallyEntry>,
  party: NfseParty,
  role: Role,
): void {
  if (!isValidDoc(party.doc)) return;
  let entry = tally.get(party.doc);
  if (!entry) {
    entry = { doc: party.doc, docs: 0, asPrest: 0, asToma: 0, nome: '' };
    tally.set(party.doc, entry);
  }
  entry.docs += 1;
  if (role === 'prest') entry.asPrest += 1;
  else entry.asToma += 1;
  if (!entry.nome && party.nome) entry.nome = party.nome;
}

/**
 * Coverage tally across the batch. The mailbox owner is the only party that
 * appears in *every* document (prestador on emitidas, tomador on recebidas),
 * so we count document-appearances per CNPJ rather than emit+receive volume.
 */
function buildTally(metas: NfseMeta[]): Map<string, OwnerTallyEntry> {
  const tally = new Map<string, OwnerTallyEntry>();
  for (const meta of metas) {
    for (const { pick, role } of PARTY_ROLES) {
      bumpTally(tally, pick(meta), role);
    }
  }
  return tally;
}

/**
 * Owner-likelihood ranking with three layered tiebreakers:
 *
 *   1. Higher document coverage wins (owner appears in every document).
 *   2. On a coverage tie, whoever appears on BOTH sides wins (real owners
 *      both emit and receive; accountants only emit).
 *   3. On a complete tie, the TOMADOR wins — a "só-recebidas" mailbox
 *      belongs to who received the notes, not to the issuing accountant.
 */
function rankTally(tally: Map<string, OwnerTallyEntry>): OwnerTallyEntry[] {
  return [...tally.values()].sort((a, b) =>
    b.docs - a.docs ||
    (bothSides(b) ? 1 : 0) - (bothSides(a) ? 1 : 0) ||
    b.asToma - a.asToma,
  );
}

/**
 * Ambiguous when coverage ties AND the "both sides" signal didn't pick a
 * clear winner. We still return a choice (tomador wins by rule 3), but the
 * caller should log the runner-up so a misfire is at least diagnosable.
 */
function isAmbiguous(ranked: OwnerTallyEntry[]): boolean {
  if (ranked.length < 2) return false;
  const [first, second] = ranked;
  if (first.docs !== second.docs) return false;
  return !(bothSides(first) && !bothSides(second));
}

/**
 * When the user typed a CNPJ-alvo, trust it as the owner identity — it's the
 * cert holder by definition. The tally only contributes the *name* for that
 * CNPJ, and only if it actually showed up in the sample.
 */
function forceConsulted(
  consulted: string,
  ranked: OwnerTallyEntry[],
  tally: Map<string, OwnerTallyEntry>,
): OwnerTallyEntry {
  const entry = tally.get(consulted);
  if (entry) return entry;
  return { doc: consulted, docs: 0, asPrest: 0, asToma: 0, nome: ranked[0]?.nome ?? '' };
}

/**
 * Picks the most likely "dono da caixa" from a batch of parsed NFSe metas.
 * Returns `null` when no parseable CNPJ/CPF was found and no `cnpjConsulta`
 * was provided — the caller should treat that as "couldn't auto-detect".
 */
export function detectOwner(metas: NfseMeta[], cnpjConsulta = ''): OwnerDetection | null {
  const tally = buildTally(metas);
  const ranked = rankTally(tally);

  if (cnpjConsulta) {
    return {
      owner: forceConsulted(cnpjConsulta, ranked, tally),
      ambiguous: false,
      runnerUp: null,
    };
  }

  if (ranked.length === 0) return null;

  const ambiguous = isAmbiguous(ranked);
  return {
    owner: ranked[0],
    ambiguous,
    runnerUp: ambiguous ? ranked[1] : null,
  };
}
