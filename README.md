# Cloudlight

Transferência privada de arquivos entre amigos. React + TypeScript + Vite, Cloudflare Worker/D1, adaptador S3 para bucket B2 privado e e-mail transacional Brevo.

O piloto está disponível em **[cloudlight.igormraesmm.workers.dev](https://cloudlight.igormraesmm.workers.dev)**, com login por convite e transferências habilitados. Cloudflare/D1, B2 privado e Brevo foram validados com upload e download completos de 50 MB e 1 GB, SHA-256 idêntico e retomada após recarga. Os três e-mails do fluxo real tiveram entrega confirmada pelo Brevo. Consulte [as evidências e limitações](docs/VALIDACAO.md) antes de ampliar o grupo; cem usuários simultâneos ainda não foram testados. O ambiente local segue disponível com serviços emulados e caixa de e-mail de teste.

```sh
npm ci
npm run dev
```

Abra http://127.0.0.1:5173. Entre com `admin@cloudlight.test` ou `amigo@cloudlight.test`; solicite o código e clique em **Ver e-mails de teste**. Os dados locais persistem em `.wrangler/state/`.

## Recursos

- Landing em React, nuvens WebGL, temas persistentes e interface responsiva em português.
- Login por convite e código único de dez minutos, sessões HttpOnly, administração restrita.
- Transferências de até 1 GB/20 arquivos, reserva atômica de 8 GB para todo o grupo.
- Multipart com duas pistas, progresso, repetição, pausa, cancelamento e retomada após recarga.
- Verificação de integridade das partes e do objeto, conclusão idempotente, link secreto de 48 horas.
- E-mails em fila, teto de 250 tentativas/dia, estados independentes do arquivo.
- Download por streaming/Range, expiração/revogação e limpeza que só libera espaço após excluir.
- Administração de até cem convidados, consumo, pendências e transferências.

## Verificação

```sh
npm run check           # TypeScript + API/integração, incluindo arquivo de 50 MB
npm run build           # Bundle de produção
npm run test:browser    # Chrome instalado ou ajuste o channel no playwright.config.ts
npm run test:large      # 50 MB e 1 GB com comparação integral de SHA-256
```

Os testes de integração usam D1 e R2 emulados no runtime workerd. Os testes de provedores interceptam a rede; não usam contas externas. As capturas de navegador ficam em `qa/` (ignorado no Git). O Miniflare está fixado na versão usada pelo runtime atual, com conversor oficial de configuração v4; não substitua por uma versão antiga sem conferir compatibilidade e dependências.

## Organização

- `src/`: landing, telas React, componentes, tokens, upload do navegador.
- `worker/`: API, autenticação, armazenamento, fila de e-mail e manutenção.
- `shared/`: contratos, validações e limites.
- `migrations/`: esquema D1, índices e garantias transacionais.
- `public/assets/`: fontes e shaders locais; procedência em `asset-sources.json`.
- `reference/`: código da landing anterior, preservado para comparação.
- `wrangler.local.jsonc`: ambiente local, sem contas ou serviços pagos.
- `wrangler.jsonc`: configuração de produção com piloto por convite habilitado.
- `docs/OPERACAO.md`: configuração das contas, limites, decisões, testes reais e liberação do piloto.
- `PLANO_IMPLEMENTACAO.md`: etapas executadas e próximos passos de ampliação.

`dist/` é gerado por Vite. A configuração `.openai/hosting.json` do Site estático anterior foi preservada como histórico; ela não publica a nova API. O destino previsto para o aplicativo é Workers, conforme o plano. Os scripts antigos de reconstrução foram preservados em `reference/scripts/` e não fazem parte do fluxo atual.

## Produção

Siga [o guia de operação](docs/OPERACAO.md). Configure Cloudflare, B2 privado e remetente Brevo; aplique migrações e grave secrets pelo Wrangler. `npm run deploy` executa preflight. A configuração inicial bloqueia a API; a abertura do piloto exige evidências reais em `pilot-readiness.json`.

Caps, bucket privado, assinaturas, rota B2/Cloudflare e remetente foram verificados. Manter custo zero depende das franquias e do consumo das contas; não há garantia sob carga ou usos externos. A CPU teve P95 de 8 ms e pico de 23 ms, sem interrupções pelo limite nos testes reais. Comece com poucos convidados e reavalie antes de ampliar.
