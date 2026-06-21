# Política de Privacidade — Baixar NFSe (Certificado Digital)

**Última atualização:** 18 de junho de 2026

Esta política explica, em linguagem simples, como a extensão **Baixar NFSe —
Certificado Digital** ("a extensão") trata os seus dados. Ela vale para a
extensão publicada na Chrome Web Store.

Resumindo em uma frase: **a extensão não coleta, não envia e não vende nenhum
dado seu. Tudo fica no seu próprio computador.**

---

## 1. Quem somos

A extensão é um projeto **open source**, gratuito, mantido de forma
independente. O código-fonte está disponível publicamente em:

https://github.com/e-mend/nfse-chrome-extension

**Contato:** vhyper616@gmail.com

---

## 2. O que a extensão faz

A extensão baixa o **XML** e o **PDF (DANFSe)** das suas Notas Fiscais de
Serviço Eletrônica (NFS-e), autenticando com o **seu certificado digital**
diretamente nos servidores oficiais da NFS-e Nacional. Ela também organiza
essas notas em uma tabela, gera relatórios e permite exportar para Excel.

Toda a comunicação acontece **diretamente entre o seu navegador e os
servidores oficiais do governo** (`nfse.gov.br` e `adn.nfse.gov.br`). Não há
nenhum servidor intermediário nosso no meio do caminho.

---

## 3. Quais dados são tratados e onde ficam

Ao usar a extensão, os seguintes dados podem ser manipulados **apenas dentro
do seu navegador/computador**:

- **Certificado digital:** usado pelo navegador para autenticar você junto aos
  servidores oficiais. A extensão **não lê, não copia e não armazena** o seu
  certificado — quem gerencia isso é o próprio Chrome/sistema operacional.
- **Notas fiscais (XML, PDF e metadados):** baixadas dos servidores oficiais e
  guardadas localmente para você consultar, filtrar e exportar.
- **Configurações e preferências:** por exemplo, padrão de nome de arquivo e
  controle de NSU por empresa, para retomar a sincronização de onde parou.

Esses dados são armazenados **localmente** no seu dispositivo, usando o
armazenamento do próprio navegador (IndexedDB e `chrome.storage.local`). Eles
**nunca** são enviados para nós nem para terceiros.

---

## 4. O que NÃO fazemos

- ❌ **Não coletamos** dados pessoais.
- ❌ **Não enviamos** seus dados para servidores nossos ou de terceiros.
- ❌ **Não vendemos** nem compartilhamos seus dados com ninguém.
- ❌ **Não usamos** seus dados para publicidade, perfis, avaliação de crédito
  ou qualquer finalidade alheia ao funcionamento da extensão.
- ❌ **Não executamos código remoto:** todo o código da extensão vem dentro do
  próprio pacote instalado pela Chrome Web Store.

---

## 5. Permissões e por que são necessárias

A extensão pede apenas as permissões indispensáveis para funcionar:

- **unlimitedStorage** — guardar localmente suas notas, configurações e o
  controle de NSU por empresa, sem o limite de cota padrão do navegador.
- **Acesso aos sites `nfse.gov.br` e `adn.nfse.gov.br`** — para consultar e
  baixar suas notas pela API oficial. **Nenhum outro site é acessado.**

Os arquivos XML e PDF são salvos pelo fluxo de download padrão do navegador
(sem a permissão `downloads`).

---

## 6. Compartilhamento com terceiros

Não há. A extensão não integra serviços de análise, rastreamento ou
publicidade. O único tráfego de rede é entre você e os servidores oficiais da
NFS-e.

---

## 7. Exclusão dos seus dados

Você tem controle total sobre os dados locais:

- Dentro da extensão, em **Configurações → Zona de perigo**, você pode apagar
  apenas as notas ou **todos os dados**.
- Remover a extensão do Chrome também apaga todos os dados que ela guardou no
  navegador.

---

## 8. Crianças

A extensão é uma ferramenta profissional/contábil e não é direcionada a
menores de idade.

---

## 9. Alterações nesta política

Podemos atualizar esta política para refletir melhorias na extensão ou
mudanças legais. A data no topo indica a última atualização. Mudanças
relevantes serão comunicadas na página da extensão na Chrome Web Store.

---

## 10. Contato

Dúvidas sobre privacidade? Escreva para **vhyper616@gmail.com** ou abra uma
issue em https://github.com/e-mend/nfse-chrome-extension.
