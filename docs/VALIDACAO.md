# Validação — 11/10/2026

A implementação foi inicialmente testada no macOS com Node 24, Chrome, workerd/Miniflare e D1/R2 emulados. Os testes locais abaixo não usaram credenciais reais de B2 ou Brevo. As verificações remotas posteriores e a primeira publicação, com o piloto fechado, estão registradas separadamente no final deste documento.

## Resultados

- TypeScript sem erros e bundle Vite de produção gerado.
- Testes de API: autenticação obrigatória, CSRF, papéis, e-mail não convidado, HMAC/cifragem do código, consumo simultâneo único, expiração, cinco tentativas, intervalo de reenvio, validação de e-mail, soma de arquivos acima de 1 GB, criação idempotente (com recusa de alteração do destinatário ao reutilizar o ID) e isolamento entre usuários.
- Duas reservas simultâneas disputaram o último 1 GB: uma foi aceita, a outra bloqueada; a soma permaneceu em 8 GB.
- Partes com conteúdo ou checksum alterado, números inválidos e finalização incompleta foram recusadas.
- Upload concluído, finalização repetida, fila única por transferência, downloads inteiros e por intervalo/sufixo, validade de 48 horas, link inválido, expiração e revogação foram exercitados.
- Exclusão aguardou o vencimento da autorização; o armazenamento só foi liberado após confirmar a remoção. Falha temporária do adaptador manteve a reserva, e a passagem seguinte concluiu a limpeza.
- Cota de e-mail bloqueou novas tentativas em 250 sem invalidar o arquivo. Bloqueio de usuário invalidou sessões; o convite de número 101 foi recusado. O teto de API também foi exercitado.
- Com rede interceptada: Brevo 503 foi reenfileirado e depois aceito; 400 virou falha visível; cookie de produção incluiu Secure; caixa de e-mail local ficou indisponível. URLs S3 assinaram escopo, multipart, número, tamanho e checksum, sem devolver a application key.
- Arquivo de **50.000.000 bytes** enviado em partes, retomado e baixado, comparando SHA-256 do conteúdo inteiro.
- Arquivo de **1.000.000.000 bytes** enviado em 120 partes, retomado e baixado por stream, comparando SHA-256 do conteúdo inteiro. Passou no comando `npm run test:large` (cerca de 32 s neste ambiente para o caso de 1 GB).
- Chrome: login com código real na caixa local, upload, link público, download, histórico e administração. Um segundo arquivo foi pausado após a primeira parte, a página foi recarregada, o original foi selecionado novamente e o envio terminou sem reenviar a parte 1.
- Landing em 1440 px e 390 px, nos dois temas, sem overflow horizontal. Abas por teclado, FAQ, menu móvel, persistência de tema e preferência por movimento reduzido verificadas. Aplicativo capturado em desktop/celular e temas claro/escuro.
- Capturas revisadas em `qa/`; comparação com a landing original em `qa/desktop.jpg`. Paleta, fonte, cantos, painel e nuvens preservados, com composição e conteúdo adaptados ao MVP. Não é uma reprodução pixel a pixel de seções removidas do template.
- Auditoria de dependências sem vulnerabilidades conhecidas na versão instalada durante a entrega.
- Verificações automáticas WCAG A/AA com axe-core na landing, entrada, link indisponível (ambos os temas) e formulário de envio escuro. Contraste de textos sobre superfícies cinza e nome acessível do seletor de arquivos corrigidos. Esse teste automatizado não equivale a uma certificação de acessibilidade.
- Preflight recusou a configuração inicial sem contas reais, como esperado.

## Comandos reproduzíveis

```sh
npm ci
npm run check
npm run build
npm run test:browser
npm run test:large
```

O teste de 1 GB é separado do conjunto rápido: nele aparece como ignorado por padrão e é executado explicitamente com `test:large`. Os testes de navegador usam Chrome instalado e geram dados somente no ambiente local; reenvios repetidos do mesmo login respeitam o intervalo real de um minuto, que o teste aguarda quando necessário.

## Limites da validação local

Estes testes não confirmam franquias da conta, caps do B2, CORS real, rejeição de uploads adulterados pelo provedor, egress gratuito via Cloudflare, CPU de 10 ms no Worker Free, remetente sem domínio próprio nem entrega em caixas externas. O adapter S3 e o formato de integração foram testados com respostas controladas; o comportamento efetivo deve ser medido com arquivos reais no bucket privado.

A checklist externa está em `docs/OPERACAO.md` e `pilot-readiness.example.json`. A abertura para cinco amigos permanece pendente.

## Verificação remota inicial do B2 — 11/10/2026

Bucket dedicado `cloudlight-igormraesmm`, privado, região `us-east-005`. Configuração conferida pela API nativa: SSE-B2/AES256, CORS restrito à origem do Cloudlight e lifecycle de dois/sete/um dias conforme o guia de operação. Caps e alertas foram conferidos no painel, sem testes de esgotamento.

O adaptador real de `worker/storage.ts` foi executado em Node contra o B2, com apenas o contador de uso D1 substituído por um contador local. Um arquivo aleatório de **65.536 bytes** passou por:

- Criação de multipart e recuperação do mesmo upload em uma segunda chamada.
- Rejeição de Content-MD5 adulterado em URL assinada: HTTP 403.
- Upload válido: HTTP 200, origem CORS correta e ETag exposto.
- ListParts, finalização e HeadObject com tamanho correto.
- Recusa de GET anônimo: HTTP 401. O teste foi ajustado para aceitar tanto 401 quanto 403 como negação, após observar a resposta real do provedor.
- Download autenticado com SHA-256 idêntico ao original.
- Exclusão da versão de teste e confirmação posterior de ausência de versões e multipart. Nenhum arquivo de teste foi mantido.

OPTIONS para PUT com os cabeçalhos reais retornou 200 para a origem do Cloudlight e 403 para `https://example.com`. Evidências locais sem credenciais estão em `qa/b2-config-verification.json`, `qa/b2-smoke-result.json` e `qa/b2-configured.png` (pasta ignorada no Git).

Isso comprova apenas a configuração e o caminho básico do adaptador. Continuam pendentes: navegador/Worker reais, arquivos de 50 MB e 1 GB, todas as adulterações de assinatura/tamanho, expiração temporal das URLs, execução temporal do lifecycle, egress pela Cloudflare, CPU/cotas e Brevo. Nenhum item abrangente de `pilot-readiness.json` foi atestado com este teste pequeno.

## Preparação do Brevo — 11/10/2026

Conta acessível e remetente `Cloudlight` com status Verified conferidos no painel. O titular concluiu a verificação de telefone e criou a chave de API. A API confirmou plano Free com 300 e-mails/dia, relay transacional habilitado e remetente ativo.

O endereço `MAIL_FROM` foi movido para a lista de secrets obrigatórios, junto das quatro credenciais existentes no contrato do Worker. Os cinco secrets foram gravados e conferidos remotamente por nome. Dry-run do Wrangler aprovado. Verificações isoladas do preflight confirmaram: configuração fechada aceita; remetente obrigatório ausente rejeitado; remetente em `vars` públicas rejeitado; piloto sem evidências rejeitado.

Um único e-mail de teste foi enviado ao administrador com autorização explícita do titular. A API retornou HTTP 201 em 11/10/2026 às 22:06:50 UTC, seguida de evento `delivered` às 22:06:51 UTC. Não houve acesso à caixa postal; pasta de destino e remetente efetivamente exibido ainda não foram conferidos. Evidências sem credenciais em `qa/brevo-account-verification.json`, `qa/brevo-test-email-result.json` e `qa/brevo-delivery-verification.json`.

Esse teste direto pela API não exercita a outbox do Worker, códigos de acesso, links de transferências, tratamento real de rejeições/cotas nem entrega em outros provedores. A validação completa do piloto permanece pendente.

## Primeira publicação com piloto fechado — 11/10/2026

`npm run deploy` concluiu preflight, TypeScript, build Vite e publicação após a ampliação das permissões OAuth do Wrangler autorizada pelo titular. Versão Cloudflare: `9c49360d-ea26-4bb2-acd0-464b6d4affbe`; origem `https://cloudlight.igormraesmm.workers.dev`; cron `*/5 * * * *`.

- Página inicial, JavaScript e CSS: HTTP 200.
- Página inicial renderizada no navegador, com conteúdo e navegação do Cloudlight.
- `/api/health` e `/api/dev/inbox`: HTTP 503 com mensagem de piloto em preparação, confirmando o bloqueio de produção por `PILOT_ENABLED=false`.
- Cinco secrets presentes após o deploy, conferidos por nome, sem leitura/exposição dos valores.
- Evidências locais: `qa/cloudflare-deployment-verification.json` e `qa/cloudlight-live.png`.

O tempo de inicialização informado pelo Wrangler não mede CPU por requisição e não comprova a capacidade de processar transferências de 1 GB no plano Free. Login, upload e download reais pelo Worker seguem pendentes; o piloto não foi aberto.


## Testes reais de 50 MB e 1 GB — 11/10/2026

Executados pelo navegador no endereço público, com Worker/D1 da Cloudflare, upload multipart direto ao B2 privado e download transmitido pelo Worker. Arquivos sintéticos aleatórios, sem conteúdo pessoal:

| Arquivo | Bytes enviados e recebidos | SHA-256 do original e do download | Resultado |
| --- | ---: | --- | --- |
| 50 MB | 50.000.000 | `278062240d82fd7ce01db8d9148097d89e646fe0baa50490c6b7d84868e33d02` | Idênticos |
| 1 GB | 1.000.000.000 | `d5b5b35899b1e0250600754f939dd9a537924cb6b2d095abff5284208de5543a` | Idênticos |

O arquivo de 1 GB utilizou 120 partes. O envio foi interrompido, a página recarregada, o original selecionado novamente e as partes já recebidas reaproveitadas. A soma de 1 GB + 50 MB foi recusada pela interface. Os três e-mails autorizados (login e duas transferências) foram enviados uma vez cada pela outbox real e tiveram evento `delivered` confirmado na API Brevo. O titular concluiu pessoalmente a autenticação com o código recebido. Não houve envio a amigos.

Os testes encontraram e corrigiram uma falha no botão de pausa: o abort podia trocar o botão por um submit antes da ação padrão do clique, retomando o envio. O handler agora cancela essa ação padrão. Pausa, recarga e retomada foram repetidas com sucesso no navegador real.

O modo temporário `PILOT_ENABLED=admin` permite validar os provedores somente com administradores autenticados. Convidados não recebem códigos nem aproveitam sessões antigas; os links de transferência exigem administrador durante essa validação. Dois testes de regressão cobrem o bloqueio de modos inválidos/fechados e as restrições do modo administrativo. `npm run check`: 21 aprovados e um teste local de 1 GB ignorado por padrão; a transferência de 1 GB desta seção foi executada remotamente.

### CPU medida no Worker Free

As primeiras requisições de autorização consumiam cerca de 8–9 ms. Reutilizar o cliente S3 e seu cache de chaves derivadas reduziu esse custo para cerca de 4–5 ms. A amostra após a otimização teve 109 invocações, mediana de 4 ms, P95 de 8 ms, pico de 23 ms na finalização de 120 partes, uma interrupção intencional e nenhuma exceção/`exceededCpu`/`exceededMemory`. O download de 1 GB completou com integridade, sem buffer integral no Worker.

O pico **não está abaixo de 10 ms**. A [documentação da Cloudflare](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) admite ultrapassagens infrequentes por isolate; não se deve tratar o teste como garantia de capacidade para cem usuários simultâneos. Antes de ampliar o grupo, repetir medições sob carga e dividir a finalização em etapas caso esses picos deixem de ser ocasionais. O tempo de inicialização do deploy não foi usado como medida de CPU por requisição.

### Restrições e cotas

Um diagnóstico temporário, protegido pela sessão administrativa e verificação de origem, executou as chamadas do adaptador dentro do Worker, usando um objeto sintético de 64 KiB. Número da parte, chave do objeto, upload ID, MD5 assinado e tamanho adulterados receberam HTTP 403 (`SignatureDoesNotMatch`); conteúdo divergente recebeu HTTP 400 (`BadDigest`). A parte correta e sua repetição receberam 200; ListParts confirmou apenas uma parte de 65.536 bytes. GET anônimo direto no B2 recebeu 401.

No D1 real, o contador diário foi testado com teto de uma operação: a segunda chamada foi bloqueada e o contador permaneceu em um. Uma transação tentou reservar o espaço restante até 8 GB e mais um byte; o trigger recusou a operação e o rollback preservou os 1,05 GB originais, sem criar reservas extras ou gravar arquivos grandes para esse teste de cota. O prazo do registro sintético de 50 MB foi antecipado e o link recusou acesso enquanto o registro ainda estava `ready`, antes da limpeza.

Evidências locais, ignoradas pelo Git: `qa/real/fixtures.json`, `50MB-result.json`, `1GB-result.json`, `1GB-paused.png`, `expired-transfer.png`, `signature-results.json`, `cpu-before-optimization.json`, `cpu-after-optimization.json` e `tail-sanitized.ndjson`. O tail foi filtrado antes da gravação para remover cookies, cabeçalhos, query strings, tokens e payloads.


### Recuperação da finalização e limites da evidência

O diagnóstico de 64 KiB revelou uma falha temporária de HEAD imediatamente após o B2 concluir o multipart. O objeto existia e uma consulta posterior confirmou o tamanho. A retomada agora reconcilia o objeto concluído quando ListParts informa que o multipart não existe mais, verificando tamanho e ETag antes de marcar sucesso. O navegador também repete a finalização idempotente até três vezes em falhas transitórias. Teste de regressão aprovado; a rota real de retomada retornou HTTP 200 com `complete: true` para o objeto que havia apresentado a falha. Evidência em `qa/real/recovery-result.json`, preservando o erro original do diagnóstico.

A URL assinada vencida foi recusada com HTTP 401. A limpeza real confirmou a remoção das versões do primeiro diagnóstico; o cron removeu o arquivo expirado de 50 MB e marcou seus registros como `deleted`.

As contas e caps foram conferidos durante a configuração nesta data. Os testes não esgotaram fisicamente as franquias de Cloudflare/D1/B2/Brevo e não simularam cem usuários simultâneos. Os cortes de e-mail e operações foram exercitados com respostas controladas e contadores; o limite diário e a reserva de 8 GB também foram exercitados no D1 real. As regras de lifecycle foram conferidas, sem aguardar sete dias; a limpeza normal foi observada no provedor real.

Os downloads de 50 MB e 1 GB percorreram B2 → Worker → navegador. A [documentação do B2](https://www.backblaze.com/docs/cloud-storage-deliver-private-backblaze-b2-content-through-cloudflare-cdn) identifica esse caminho, inclusive `workers.dev`, como elegível à transferência gratuita. Isso não equivale a conferir uma fatura fechada. A sessão do painel B2 expirou durante a consulta final de consumo; os caps anteriormente confirmados não foram alterados. Nenhum plano pago foi ativado.


### Publicação do piloto

`npm run deploy` aprovou preflight, TypeScript e build, e publicou a versão `4a135303-1a0b-4ae1-8e3b-51fd3c3f51bc` com `PILOT_ENABLED=true` e o entrypoint normal `worker/index.ts`. O diagnóstico temporário não integra essa versão. O administrador existente pode enviar arquivos e adicionar convidados; nenhum amigo foi cadastrado automaticamente.

Verificação posterior, sem cookie: health 200 (`local: false`), sessão e rotas administrativas 401, metadados do link sintético de 1 GB 200, download Range de 1 MiB com 206 e hash idêntico ao trecho original. Cabeçalhos `no-store` e `no-referrer` presentes. Evidência: `qa/real/release-verification.json`. O teste confirmou que o destinatário pode baixar com o link válido sem ter conta.


O link sintético de 1 GB foi revogado após essa verificação e passou a retornar HTTP 410. O arquivo expirado de 50 MB já foi excluído e o espaço liberado; o de 1 GB e o diagnóstico final foram destinados à limpeza normal do cron, que processa um arquivo por passagem e só libera a reserva após confirmar ausência no B2. A tabela temporária de diagnóstico foi removida do D1. Não há arquivos de teste públicos disponíveis. O histórico de testes segue a retenção normal de 30 dias.


### Conferência posterior no painel B2 — 11/10/2026, 20h05 (Brasília)

Após o titular renovar a sessão, o painel autenticado mostrou:

- Bucket privado e criptografado: **0 arquivos atuais, 0 bytes**.
- Caps & Alerts: armazenamento de hoje **US$ 0,00 (85 MB)** e download **US$ 0,00 (66 KB)**; limites de US$ 0,00/10 GB e US$ 0,00/1 GB preservados, alertas ativos.
- Transações diárias: classe B **12/2.500**, classe C **59/2.500**.
- Reports: **354 transações** (285 A, 12 B, 57 C), com aviso de atualização diária à meia-noite GMT. Diferenças em relação a Caps & Alerts refletem os momentos de atualização; a tela não foi tratada como uma fatura fechada.

O volume de 66 KB exibido em downloads não representa o total transferido pelo aplicativo: os testes de 50 MB e 1 GB tiveram suas cópias completas verificadas separadamente. O painel é compatível com a rota Cloudflare sem cobrança de egress, mas a observação não garante custos futuros.

O D1 ainda conservava a reserva de 1.000.065.536 bytes dos dois últimos testes enquanto aguarda confirmação da limpeza; não foi forçada a liberação da cota. Os links já estavam indisponíveis. Nenhum limite, plano ou configuração de cobrança foi alterado nesta conferência.

Evidências locais: `qa/real/b2-account-after-tests.json`, `b2-cost-after-tests.png`, `b2-bucket-empty.png` e `cleanup-confirmation.json`.
