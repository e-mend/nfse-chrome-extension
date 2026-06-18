export function AboutTab() {
  return (
    <div className="bnf-tab-content">
      <p>Sobre a extensão Baixar NFSe (Beta) - Certificado Digital</p>
      <p>Versão: 1.0.0 (beta)</p>
      <p>Para sugestões ou reportar bugs, envie um email para <b>vhyper616@gmail.com</b></p>

      <br />
      <p>Este é um projeto open source e você pode contribuir com o projeto no GitHub:</p>
      <a href="https://github.com/e-mend/nfse-chrome-extension" target="_blank" rel="noopener noreferrer">
        <b>https://github.com/e-mend/nfse-chrome-extension</b>
      </a>

      <br />

      <section
        style={{
          marginTop: 18,
          background: '#111827',
          border: '1px solid var(--bnf-line)',
          borderLeft: '3px solid var(--bnf-green)',
          borderRadius: 'var(--bnf-radius-sm)',
          padding: '14px 16px',
        }}
      >
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>
          ☕ Esta extensão é gratuita — e vai continuar sendo.
        </p>
        <p style={{ margin: '0 0 10px', lineHeight: 1.55 }}>
          Se ela te poupou <b>horas de trabalho manual</b> (e provavelmente já se pagou no primeiro
          uso), que tal retribuir com o valor de <b>um cafézinho? A partir de R$ 1</b> você ajuda a
          manter o projeto vivo, pagar custos de manutenção e garantir as <b>próximas atualizações</b>.
          São centenas de pessoas usando — se cada uma contribuir com pouco, o projeto segue de pé. 🙏
        </p>

        <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--bnf-teal)' }}>
          Benefícios para quem apoia:
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <b>Prioridade em issues e feature requests</b> — não garante que tudo será feito, mas sua
            solicitação entra na <b>fila de triagem mais rápido</b>.
          </li>
          <li>Aquele sentimento bom de manter uma ferramenta gratuita no ar para todo mundo. 💚</li>
        </ul>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <a
            href="https://github.com/sponsors/e-mend"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 'var(--bnf-radius-sm)',
              background: 'var(--bnf-green)',
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ❤️ Patrocinar no GitHub
          </a>
          <a
            href="https://buymeacoffee.com/emend"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 'var(--bnf-radius-sm)',
              background: '#FFDD00',
              color: '#0f172a',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            ☕ Buy Me a Coffee
          </a>
        </div>
      </section>

      <section
        style={{
          marginTop: 18,
          background: '#0f172a',
          border: '1px solid var(--bnf-line)',
          borderLeft: '3px solid var(--bnf-teal)',
          borderRadius: 'var(--bnf-radius-sm)',
          padding: '14px 16px',
        }}
      >
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>
          📄 Termos de uso e privacidade
        </p>

        <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--bnf-teal)' }}>
          Projeto open source
        </p>
        <p style={{ margin: '0 0 12px', lineHeight: 1.55 }}>
          Este é um projeto <b>open source</b>: o código é aberto e você pode estudá-lo, usá-lo e
          contribuir livremente. No entanto, o projeto <b>não pode ser comercializado como um fim
          em si</b> — ou seja, é proibido vender, revender ou cobrar pela extensão ou por
          redistribuições dela como produto. O uso pessoal e profissional da ferramenta é, e
          continuará sendo, gratuito.
        </p>

        <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--bnf-teal)' }}>
          Termos de uso (resumo)
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            A extensão é fornecida <b>"como está"</b>, sem garantias de qualquer tipo. O uso é de
            <b> responsabilidade do usuário</b>.
          </li>
          <li>
            Use a ferramenta apenas com <b>certificados e dados que você tem direito de acessar</b>,
            respeitando a legislação aplicável.
          </li>
          <li>
            É permitido usar e contribuir, mas <b>não comercializar</b> a extensão como produto.
          </li>
        </ul>

        <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--bnf-teal)' }}>
          Privacidade e seus dados
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <b>Nenhum dado é compartilhado com terceiros.</b> Não há coleta, envio ou venda de
            dados para fora do seu dispositivo.
          </li>
          <li>
            Seus dados — incluindo <b>certificados, notas e configurações</b> — ficam armazenados
            <b> apenas localmente</b>, no seu próprio navegador/computador.
          </li>
          <li>
            A comunicação acontece <b>diretamente entre você e os servidores oficiais da prefeitura</b>,
            sem intermediários.
          </li>
        </ul>
      </section>
    </div>
  );
}
