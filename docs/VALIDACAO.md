# Validação — 11/10/2026

A implementação foi inicialmente testada no macOS com Node 24, Chrome, workerd/Miniflare e D1/R2 emulados. Os testes locais abaixo não usaram credenciais reais de B2 ou Brevo. A verificação remota posterior está registrada separadamente no final deste documento; o aplicativo ainda não foi publicado.

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
