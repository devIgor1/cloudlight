# Validação local — 11/10/2026

A implementação foi testada no macOS com Node 24, Chrome, workerd/Miniflare e D1/R2 emulados. Nenhuma chamada usou credenciais reais de B2 ou Brevo. Nenhuma publicação foi realizada.

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

## Limites desta validação

Estes testes não confirmam franquias da conta, caps do B2, CORS real, rejeição de uploads adulterados pelo provedor, egress gratuito via Cloudflare, CPU de 10 ms no Worker Free, remetente sem domínio próprio nem entrega em caixas externas. O adapter S3 e o formato de integração foram testados com respostas controladas; o comportamento efetivo deve ser medido com arquivos reais no bucket privado.

A checklist externa está em `docs/OPERACAO.md` e `pilot-readiness.example.json`. A abertura para cinco amigos permanece pendente.
