export function Header() {
  return (
    <>
      <header className="bnf-top">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <h1>Baixar NFSe (Beta) · Certificado Digital</h1>
      </header>
      <p className="bnf-sub">
        Baixa os XMLs das NFS-e pela <strong>API oficial</strong> (ADN)
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 10,
          margin: '0 auto 16px',
          padding: '8px 14px',
          maxWidth: 620,
          background: '#111827',
          border: '1px solid var(--bnf-line)',
          borderLeft: '3px solid var(--bnf-green)',
          borderRadius: 'var(--bnf-radius-sm)',
        }}
      >
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--bnf-ink)' }}>
          ☕ Projeto <b>open source e gratuito</b>. Te ajudou? Apoie a partir de <b>R$ 1</b> e
          mantenha as próximas atualizações.
        </span>
        <a
          href="https://github.com/sponsors/e-mend"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 12px',
            borderRadius: 'var(--bnf-radius-sm)',
            background: 'var(--bnf-green)',
            color: '#fff',
            fontSize: 11.5,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          ❤️ Patrocinar
        </a>
        <a
          href="https://buymeacoffee.com/emend"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 12px',
            borderRadius: 'var(--bnf-radius-sm)',
            background: '#FFDD00',
            color: '#0f172a',
            fontSize: 11.5,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          ☕ Buy Me a Coffee
        </a>
      </div>
    </>
  );
}
