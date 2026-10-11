# Operação do Cloudlight

Implementado e testado localmente em 11/10/2026. Na mesma data, o usuário autorizou a configuração dos serviços externos para publicação em `workers.dev`. A operação real das integrações e o custo zero continuam pendentes de validação.

## Configuração remota em andamento — 11/10/2026

- Cloudflare autenticada via Wrangler, com credenciais cifradas e chave no Keychain do macOS.
- Conta e origem previstas registradas em `wrangler.jsonc`: `https://cloudlight.igormraesmm.workers.dev`. Esse endereço ainda não foi publicado.
- D1 `cloudlight` criado em ENAM; migrações `0001_initial.sql`, `0002_rate_expiry.sql` e `0003_login_cooldown.sql` aplicadas remotamente.
- Administrador inicial criado no D1 de produção com o e-mail confirmado pelo usuário.
- B2 `cloudlight-igormraesmm` criado privado em `us-east-005`, com criptografia SSE-B2/AES256 e Object Lock desativado. Endpoint e região registrados em `wrangler.jsonc`.
- CORS aplicado pela API nativa: somente `s3_put`, origem exata do Cloudlight, cabeçalhos `content-md5`/`content-type`, exposição de `etag` e cache de 300 s. O preset do painel não permitia PUT; foi substituído pela regra específica. OPTIONS autorizado retornou 200 e origem externa retornou 403.
- Lifecycle aplicado a `transfers/`: cancelar multipart incompleto após dois dias, ocultar após sete dias e excluir um dia após ocultar. É proteção adicional contra órfãos; a aplicação continua responsável pela expiração de acesso em 48 h e limpeza normal.
- Caps conferidos no painel: armazenamento US$ 0,00 (10 GB), download diário US$ 0,00 (1 GB), classes B e C com 2.500 operações/dia cada, alertas por e-mail ativos. Isso não comprova ainda a elegibilidade de egress gratuito pela Cloudflare nem os testes de corte em cada teto.
- Chave `cloudlight-worker` criada no painel, restrita ao bucket e ao prefixo `transfers/`, sem listagem de todos os buckets. O perfil Read and Write do painel inclui permissões de configuração do bucket além das operações de arquivos; não é uma chave limitada apenas às quatro operações do adaptador.
- Worker `cloudlight` criado pelo Wrangler como rascunho mínimo para armazenar `B2_KEY_ID`, `B2_APPLICATION_KEY` e um `AUTH_SECRET` aleatório de 32 bytes. Secrets remotos conferidos por nome; cópias locais temporárias removidas. O código do aplicativo ainda não foi publicado.
- Teste real do adaptador com 64 KiB aprovado: multipart/retomada, assinatura, finalização, SHA-256, bloqueio de leitura anônima e exclusão de versões. Executado da máquina local, com contador D1 simulado; não valida o fluxo no Worker ou egress. Evidências detalhadas em `docs/VALIDACAO.md`.
- Conta Brevo criada. Remetente `Cloudlight` aparece como Verified no painel, usando o endereço pessoal confirmado pelo usuário. O painel mostra 300 e-mails disponíveis/dia e avisa que domínio de e-mail gratuito não é recomendado. Isso não equivale a autenticação de domínio próprio ou comprovação de entrega.
- Brevo exige verificação de telefone antes de permitir a criação de uma chave de API. A janela foi deixada aberta para o titular concluir essa etapa; nenhum código de SMS foi solicitado pelo chat. `BREVO_API_KEY` e `MAIL_FROM` ainda não foram gravados na Cloudflare, e nenhum e-mail real foi enviado nesta etapa.
- `MAIL_FROM` passou a ser secret, mantendo o endereço pessoal fora do repositório. Os cinco secrets exigidos pelo aplicativo estão declarados em `secrets.required`. Preflight e dry-run aprovados; a publicação real ainda depende dos secrets ausentes e dos próximos passos de configuração.
- `PILOT_ENABLED=false` permanece configurado. Nenhum item de validação de provedores foi atestado por estes passos de infraestrutura.

## Ambiente local

Requer Node.js 22.12+ ou 24 e npm. Execute `npm ci` e `npm run dev`. A interface fica em http://127.0.0.1:5173; o Worker local em http://127.0.0.1:8787. Vite encaminha `/api` para o Worker. Use o endereço 127.0.0.1 para coincidir com `APP_ORIGIN`.

O comando aplica as migrações e cria somente no ambiente local:

- `admin@cloudlight.test`, administrador;
- `amigo@cloudlight.test`, usuário convidado.

Na tela de entrada, solicite o código e abra **Ver e-mails de teste**. O código é gerado de verdade, expira em dez minutos e funciona uma vez. Não há senha ou código fixo. A caixa local pode ser consultada por `/api/dev/inbox`, exclusivamente no modo local e em host de loopback. Não é um serviço externo de e-mail.

D1 e um bucket R2 emulado persistem em `.wrangler/state/`. O R2 é usado apenas como armazenamento local de teste; produção usa B2. Os dados não saem da máquina. O modo local mantém o cookie HttpOnly/SameSite, mas dispensa Secure em HTTP. Produção inclui Secure. O segredo de desenvolvimento é público, separado e nunca deve ser reutilizado.

A limpeza local pode ser disparada na administração. Autorizações de partes duram cinco minutos; a remoção aguarda esse prazo mais um minuto. Um envio incompleto pode ser retomado durante 24 horas. Não altere esse prazo enquanto houver URLs emitidas.

## Arquitetura e consistência

- React/TypeScript/Vite, tokens e componentes compartilhados, fontes Geist locais, shaders originais com desmontagem e pausa por visibilidade/movimento reduzido.
- Worker: autenticação e permissões por operação, proteção de origem em mutações, D1 para metadados, outbox e estados.
- D1: trigger atômico impede mais de 8.000.000.000 bytes reservados/armazenados/aguardando exclusão. A reserva nasce na mesma transação que os arquivos. Ela só é liberada após remover todos os arquivos da transferência. GB significa decimal.
- Upload: partes de 8 MiB, duas pistas no navegador, até três tentativas. Cada URL S3 assina chave, upload ID, número, Content-MD5 e Content-Length. Não permite escolher a chave ou ler objetos. O navegador envia o Content-Length real; a imposição desses campos pelo B2 é um teste obrigatório antes do piloto.
- Um ID de requisição evita duplicação ao repetir a criação. Um ID de multipart persistido permite retomada após recarga. Os originais precisam ser selecionados novamente; nome, tamanho, modificação e MD5 das partes são conferidos. O MD5 verifica corrupção de transporte; não é uma promessa de proteção criptográfica contra colisões deliberadas.
- O servidor consulta ListParts, compara tamanhos e ETags, finaliza e verifica HeadObject e ETag multipart. Perdas de resposta na criação são reconciliadas por prefixo/chave; na finalização por HEAD. Leases evitam iniciar/finalizar/limpar o mesmo arquivo simultaneamente.
- Conclusão da transferência e inserção do e-mail são atômicas. O link só nasce após todos os arquivos passarem na verificação. Tokens aleatórios de 256 bits são indexados por SHA-256; o valor recuperável e o conteúdo dos e-mails ficam cifrados com AES-GCM. Códigos de seis dígitos ficam em HMAC com segredo do servidor. Sessões armazenam somente o hash do cookie.
- A cada GET público a API verifica status e prazo. Downloads são streams, com Range, attachment, no-store e no-referrer. Não há CDN cache compartilhado nem link direto de leitura do bucket. Uma conexão iniciada antes da expiração pode terminar; expiração bloqueia novas solicitações.
- A fila de e-mail usa lease, prioridade para login, cinco tentativas e backoff. Respostas 429/5xx do Brevo são temporárias; rejeições 4xx são falhas visíveis. Cada tentativa consome uma unidade do teto diário de 250, inclusive uma falha, para uma contagem conservadora. Timeout após o provedor aceitar pode gerar uma entrega repetida: entrega exatamente uma vez não é garantida. A transferência e seu link permanecem únicos.
- O cron roda a cada cinco minutos: dois e-mails, um arquivo por lote, remoção de multipart/versões e retenção de metadados. Respostas de exclusão incertas mantêm a reserva. A verificação de lista vazia em uma passagem posterior confirma a remoção do B2. Logs do aplicativo não registram códigos, cookies, mensagens ou tokens.
- Histórico paginado em 20 registros, consultas agrupadas e retenção de transferências removidas por 30 dias. Administração mostra 20 transferências recentes. Expiração não depende da limpeza.

## Preparação das contas, sem ativar planos pagos

1. Confirme Cloudflare Workers **Free**, D1 gratuito, B2 com a franquia gratuita e Brevo Free. Não habilite upgrades automáticos. A aplicação não compra planos.
2. No Cloudflare, crie um D1 e substitua `database_id` em `wrangler.jsonc`. Configure o subdomínio workers.dev em `APP_ORIGIN`. Mantenha `PILOT_ENABLED=false` inicialmente.
3. No B2, use um bucket dedicado **privado**, sem dados de outros projetos. Crie application key restrita a esse bucket, com permissões de listar, escrever, ler, excluir arquivos e listar uploads/versões. Configure `B2_ENDPOINT`, `B2_REGION` e `B2_BUCKET`. Não use a master key.
4. Configure caps/alertas da conta para armazenamento, downloads e operações, considerando o uso de outros produtos. Confirme o comportamento de corte de cada cap. Os contadores da aplicação não cobrem operações realizadas fora dela, tentativas diretas repetidas nas URLs assinadas nem outros aplicativos.
5. Adapte `b2-cors.example.json` para a origem exata. CORS não substitui autorização. Adapte `b2-lifecycle.example.json` no bucket dedicado como proteção de órfãos; o prazo de sete dias evita apagar arquivos ainda válidos. A expiração de acesso em 48 h continua na API.
6. No Brevo, verifique o remetente e habilite o uso transacional da API. Configure o nome público em `MAIL_FROM_NAME`; o endereço `MAIL_FROM` será um secret para não registrar o e-mail pessoal no repositório. O uso sem domínio próprio depende da aprovação e das regras do provedor; não está confirmado. Se for incompatível, o requisito de custo zero precisa ser resolvido antes do piloto.
7. Grave secrets pelo CLI, nunca em `vars`, frontend ou Git. Os cinco nomes estão declarados em `secrets.required`: o Wrangler exige os bindings no deploy, além da validação local do preflight.

```sh
npx wrangler secret put AUTH_SECRET
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APPLICATION_KEY
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put MAIL_FROM
```

Use segredo aleatório com pelo menos 32 bytes para AUTH_SECRET. Trocá-lo invalida desafios e impede decifrar links/outbox antigos; faça rotação planejada depois de expirar/limpar esses registros. Não reutilize o segredo local.

8. Aplique o esquema remoto com `npx wrangler d1 migrations apply cloudlight --remote`. Edite uma cópia de `bootstrap-admin.example.sql` com o e-mail real e execute-a nesse D1. Nenhum seed local deve ser executado em produção.
9. `npm run deploy` valida configuração e publica no Workers, sem usar o antigo Site estático. Com `PILOT_ENABLED=false`, a API permanece fechada. A conta/piloto só deve ser aberto após a bateria real abaixo. Para um teste privado dos provedores, use configuração de staging e bucket/D1 isolados, somente com seu administrador convidado, sem enviar convites a amigos.
10. Após validar, copie `pilot-readiness.example.json` para `pilot-readiness.json`, documente a data e as evidências, marque somente os testes aprovados e ajuste `PILOT_ENABLED=true`. O preflight bloqueia a abertura com itens pendentes. Essa atestação local não consulta as contas nem substitui os testes.

## Testes reais ainda obrigatórios

- Um arquivo de 50 MB e um de 1 GB: upload no navegador, interromper/recarregar/retomar, receber e-mail e comparar SHA-256 do download inteiro.
- Em uma URL assinada, tentar outro número, arquivo, multipart, Content-MD5, conteúdo e tamanho; o provedor deve recusar sem armazenar dados adicionais. Testar repetição da mesma parte, expiração e limpeza de versões/órfãos.
- Confirmar que GET anônimo direto no B2 é negado e que a resposta do aplicativo não revela credenciais de conta. Inspecionar logs e ferramentas de observabilidade antes de habilitá-los.
- Confirmar a elegibilidade efetiva da rota B2→Worker Cloudflare para a integração de egress gratuito. Downloads feitos diretamente da máquina local não validam esse caminho.
- Medir CPU por requisição no Worker Free, especialmente ListParts/Complete para 1 GB, e o número de subrequests. O emulador não impõe o limite de CPU da conta gratuita. Se necessário, reduzir lotes ou separar etapas antes de abrir.
- Alcançar cada teto de teste com valores temporariamente menores: espaço, e-mails, operações, D1 e limites do provedor. Conferir que o corte acontece sem ativação de cobrança.
- Confirmar remetente, caixa de entrada, rejeições, timeout e fila Brevo. “Aceito pelo e-mail” não significa entrega ou leitura.
- Só então convidar cinco amigos, observar falhas e ampliar gradualmente até cem.

## Franquias e fontes consultadas em 11/10/2026

A documentação pública confirma referências de preço/limite; não confirma elegibilidade ou configurações destas contas.

- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/): Free com 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB no total. Cotas esgotadas interrompem operações no Free.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): 100 mil requisições/dia, 10 ms de CPU por requisição e 128 MB no Free. Uploads diretos evitam trafegar 1 GB por uma requisição ao Worker.
- [B2 pricing](https://www.backblaze.com/cloud-storage/pricing): os primeiros 10 GB de armazenamento são gratuitos. A margem entre 8 GB operacionais e 10 GB não é uma garantia contra custos externos ou falhas de configuração.
- [B2/Cloudflare privado](https://www.backblaze.com/docs/cloud-storage-deliver-private-backblaze-b2-content-through-cloudflare-cdn), [caps](https://www.backblaze.com/docs/cloud-storage-create-and-manage-caps-and-alerts) e [lifecycle](https://www.backblaze.com/docs/cloud-storage-lifecycle-rules).
- [S3 UploadPart](https://www.backblaze.com/apidocs/s3-upload-part) e [CompleteMultipartUpload](https://www.backblaze.com/apidocs/s3-complete-multipart-upload).
- [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan): 300 envios/dia no plano público consultado; aplicativo limitado a 250 tentativas por dia UTC, incluindo autenticação. Confirme o fuso de reset do provedor e reserve a margem para outros usos da conta.
- [Condições do remetente](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders) e [API transacional](https://developers.brevo.com/reference/send-transac-email).

Tetos adicionais da aplicação: 1.800 operações/autorização de armazenamento e 10.000 requisições API por dia UTC, 1.500 requisições/hora/IP. Downloads e limpeza também consomem operações. O teto conservador de operações pode interromper o serviço antes de preencher 8 GB; é intencional. Requisições estáticas usam Static Assets e não consultam D1. A aplicação não promete franquias exclusivas quando a mesma conta serve outros projetos.
