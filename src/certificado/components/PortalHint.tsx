interface PortalHintProps {
  onDismiss?: () => void;
}

export function PortalHint({ onDismiss }: PortalHintProps) {
  return (
    <div className="bnf-portal-hint" id="portalStatusHint">
      ⚠️ O portal/ADN pode estar instável ou fora do ar agora — não é problema do seu certificado.{' '}
      <a
        href="https://downdetector.com.br/fora-do-ar/nfse/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Verificar o status do NFS-e ↗
      </a>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar"
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
