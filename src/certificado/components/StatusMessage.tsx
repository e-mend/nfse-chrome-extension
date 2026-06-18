import type { StatusState } from '../../lib/status';

interface StatusMessageProps {
  status: StatusState;
  onDismiss?: () => void;
}

/**
 * Renders the `#status` div behavior. Kept as a custom block instead of
 * PrimeReact's <Message/> because the four
 * variants (info/success/warn/error) have specific color tokens that the rest
 * of the layout references, and the spinning indicator is inline.
 */
export function StatusMessage({ status, onDismiss }: StatusMessageProps) {
  if (!status.kind) return null;
  return (
    <div className={`bnf-status ${status.kind}`} role="status">
      {status.busy && <span className="bnf-spinner" aria-hidden="true" />}
      <span>{status.message}</span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dispensar"
          onClick={onDismiss}
          style={{
            float: 'right',
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 12,
            opacity: 0.7,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
