# Plano de implementação — Cloudlight

Atualizado em: 11 de outubro de 2026.

Status: implementação local e primeira publicação executadas em 11/10/2026. Cloudflare/D1, bucket privado B2 e Brevo configurados, com os cinco secrets gravados e testes reais pequenos de armazenamento e entrega de e-mail aprovados. Página acessível em `https://cloudlight.igormraesmm.workers.dev`; login e transferências fechados por `PILOT_ENABLED=false`. Validação completa e abertura do piloto ainda pendentes.

**Escopo atual confirmado pelo usuário:** após concluir a preparação local, configurar Cloudflare, Backblaze B2 e Brevo para publicar no endereço gratuito `workers.dev`. Manter os limites de custo e validar as integrações antes de abrir o piloto. Itens marcados abaixo indicam implementação e verificação local, salvo evidências remotas registradas no guia de operação. Consulte [README.md](README.md), [guia de operação](docs/OPERACAO.md) e [relatório de validação](docs/VALIDACAO.md).

A landing anterior foi preservada em `reference/`, e seus assets em `public/assets/`. `dist/` agora é saída do Vite. As seções de planos, métricas/depoimentos fictícios e recursos fora do MVP foram substituídas por conteúdo compatível com o serviço.

## 1. Objetivo

Construir um serviço privado de transferência de arquivos por e-mail para até 100 amigos, usando a identidade visual da landing existente e mantendo a infraestrutura nas cotas gratuitas.

O remetente convidado entra no sistema, seleciona os arquivos, informa o destinatário e uma mensagem. Após concluir o upload, o destinatário recebe um link para baixar os arquivos, disponível por 48 horas.

A landing também será migrada para React. Landing e aplicativo compartilharão componentes, estilos, fontes e preferência de tema.

## 2. Escopo e limites iniciais

| Regra | Configuração proposta |
| --- | --- |
| Público | Até 100 amigos; remetentes entram por convite |
| Tamanho habitual dos arquivos | De 50 MB a 1 GB |
| Limite por transferência | 1 GB na soma de todos os arquivos |
| Disponibilidade | 48 horas após a conclusão do upload |
| Espaço do grupo | Teto operacional de 8 GB, incluindo reservas e arquivos pendentes de exclusão |
| Destinatários | Um por transferência no MVP |
| E-mails | Teto interno de 250 por dia, incluindo autenticação e confirmações |
| Download | Sem cadastro, mediante link secreto válido |
| Ao atingir uma cota | Bloquear ou adiar a operação afetada, com uma mensagem clara |
| Endereço inicial | Subdomínio gratuito `workers.dev` |

O espaço é compartilhado pelo grupo inteiro. O número de usuários cadastrados não representa uma reserva individual de armazenamento.

Quem receber um link por encaminhamento também poderá baixar os arquivos enquanto ele estiver válido. O acesso por link não comprova a identidade de quem baixou.

O objetivo de custo é R$ 0 de infraestrutura dentro das franquias disponíveis. A validação dessas franquias e dos bloqueios efetivos é condição para abrir o piloto; o sistema não deverá ativar planos pagos ou ampliar limites automaticamente.

## 3. Identidade visual

Usar a landing anterior como referência visual. Os arquivos originais `dist/reference.css`, `dist/styles.css` e `dist/index.html` foram preservados em `reference/`; os shaders ficam em `public/assets/`.

| Elemento | Tema claro | Tema escuro |
| --- | --- | --- |
| Fundo de destaque | `#A7EFFE` | `#0E1219` |
| Fundo principal | `#FFFFFF` | `#0A0A0A` |
| Texto principal | `#0A0A0A` | `#FAFAFA` |
| Superfícies secundárias | `#F5F5F5` | `#171717` |
| Texto secundário | `#737373` | `#A3A3A3` |
| Bordas | `#E5E5E5` | `#262626` |

- Manter Geist como fonte principal e Geist Mono para informações técnicas.
- Preservar botões pretos no tema claro, cartões arredondados, bordas discretas e sombras suaves.
- Centralizar cores, tipografia, espaçamentos, raios e animações em tokens CSS compartilhados.
- Reaproveitar a composição do painel demonstrativo: barra lateral azul-clara, área central branca e ações principais escuras.
- Preservar as nuvens WebGL nas áreas de apresentação; usar movimentos leves nos formulários e indicadores de progresso.
- Respeitar `prefers-reduced-motion`, navegação por teclado, foco visível e contraste adequado nos dois temas.
- Persistir a preferência de tema ao navegar entre landing e aplicativo.

## 4. Arquitetura

| Parte | Implementação |
| --- | --- |
| Landing e aplicativo | React + TypeScript + Vite |
| Hospedagem dos arquivos estáticos | Cloudflare Workers Static Assets |
| API e tarefas agendadas | Cloudflare Workers |
| Banco de dados | Cloudflare D1 |
| Arquivos dos usuários | Bucket privado no Backblaze B2 |
| E-mails | Brevo |
| Ambiente local | Vite e ferramentas locais do Cloudflare |

Fluxo dos arquivos:

1. O navegador solicita autorização à API.
2. O Worker verifica a sessão, os limites e a disponibilidade de espaço; registra a reserva no D1.
3. O navegador envia o arquivo em partes diretamente ao Backblaze, com autorizações temporárias e restritas.
4. O backend confirma os arquivos armazenados, disponibiliza a transferência e registra o e-mail para envio.
5. No download, o Worker verifica o link e a validade e transmite a resposta do Backblaze ao destinatário.

Os arquivos não serão armazenados no D1 nem carregados inteiros na memória do Worker. O D1 guardará metadados, permissões, sessões e estado das operações.

A implementação usará a integração documentada entre Backblaze e Cloudflare para os downloads. O bucket continuará privado, e cada solicitação deverá passar pela verificação de acesso antes de receber os dados.

## 5. Rotas e telas

| Rota | Tela e comportamento |
| --- | --- |
| `/` | Landing migrada para React |
| `/entrar` | Solicitação e verificação do código de acesso |
| `/app/enviar` | Arquivos, destinatário, mensagem, tamanho total, validade e progresso |
| `/app/transferencias` | Histórico, status, validade, cópia do link e revogação |
| `/t/:token` | Remetente, mensagem, lista de arquivos, prazo restante e download |
| `/app/admin` | Convites, usuários, consumo, pendências e administração das transferências |

As telas terão estados de carregamento, vazio, sucesso, erro, acesso negado, cota atingida e link expirado, conforme aplicável.

## 6. Etapas de implementação

### Etapa 1 — Validar a operação gratuita

- [x] Configurar os ambientes local e de teste.
- [ ] Confirmar a disponibilidade dos planos gratuitos nas contas usadas.
- [ ] Validar a criação e o uso de um bucket privado sem contratação de plano pago.
- [ ] Configurar controles de consumo no provedor e no aplicativo, considerando também requisições e operações.
- [ ] Verificar o envio pelo Brevo sem compra de domínio e as condições de validação do remetente.
- [ ] Testar upload e download reais pela integração Backblaze–Cloudflare.
- [ ] Validar que o acesso direto não expõe o bucket e que as credenciais permanecem apenas no backend.

**Situação atual:** ambiente local e testes preparados; fontes públicas consultadas. Caps internos de espaço, e-mail, operações e API implementados. Nenhuma conta externa foi criada ou validada.

**Critério de conclusão:** o caminho completo funciona dentro das franquias, e os limites necessários para manter o custo zero estão identificados e testados. Uma incompatibilidade com essa condição deve ser resolvida antes de abrir o piloto.

### Etapa 2 — Migrar a landing e estabelecer os componentes React

- [x] Configurar React, TypeScript e Vite no projeto.
- [x] Migrar a landing por seção: navegação, hero, funcionalidades, FAQ, chamadas para ação e rodapé.
- [x] Preservar inicialmente o visual para permitir comparação com a versão atual.
- [x] Adaptar nuvens WebGL, animações de entrada, abas, menus e demais interações ao ciclo de vida do React.
- [x] Remover corretamente listeners e interromper animações ao desmontar componentes; evitar inicializações duplicadas.
- [x] Compartilhar tokens e componentes de botões, cartões, campos e navegação.
- [x] Implementar a persistência do tema claro/escuro.
- [x] Comparar as versões em desktop e celular.

**Critério de conclusão:** a landing em React mantém a identidade e os comportamentos atuais, sem regressões visuais relevantes.

### Etapa 3 — Construir as telas e a autenticação

- [x] Implementar as rotas e os estados de interface definidos neste plano.
- [x] Criar o cadastro de convidados e a distinção entre administrador e usuário.
- [x] Permitir solicitação de acesso apenas conforme a política de convites.
- [x] Implementar códigos de uso único, com validade de dez minutos, intervalo entre reenvios e limite de tentativas.
- [x] Armazenar os códigos de forma protegida e não registrá-los em logs.
- [x] Criar sessões com cookies `HttpOnly`, `Secure` e política `SameSite` adequada.
- [x] Verificar permissões no backend para cada operação.
- [x] Contabilizar os e-mails de autenticação na cota diária.

**Critério de conclusão:** um convidado consegue entrar, sair e acessar apenas suas operações; as funções administrativas ficam restritas ao administrador.

### Etapa 4 — Implementar upload e retomada

- [x] Validar o total de 1 GB por transferência no frontend e no backend.
- [x] Reservar espaço de forma atômica no D1 antes de autorizar o envio.
- [x] Considerar uploads simultâneos, arquivos ainda armazenados e reservas em andamento no teto de 8 GB.
- [x] Implementar upload multipart com paralelismo limitado, progresso real e repetição das partes que falharem.
- [ ] Validar no provedor as restrições de tamanho e escopo das autorizações temporárias.
- [x] Permitir cancelamento e retomada.
- [x] Persistir o estado necessário para retomar após recarregar a página, solicitando novamente o arquivo original quando necessário.
- [x] Confirmar tamanho e integridade dos arquivos antes de disponibilizar o link.
- [x] Tratar finalizações repetidas de forma idempotente.

**Critério de conclusão:** um arquivo de 1 GB pode ser enviado com interrupção e retomada, sem ultrapassar a cota por concorrência e sem criar transferências duplicadas.

### Etapa 5 — Conectar e-mail e download

- [x] Gerar links secretos apenas após confirmar a conclusão de todos os arquivos.
- [x] Registrar os e-mails pendentes no D1 junto à conclusão da transferência.
- [x] Processar a fila com tentativas controladas e tratamento de falhas temporárias.
- [x] Exibir separadamente os estados do arquivo e do envio do e-mail.
- [x] Aplicar o teto diário de e-mails antes de solicitar novos envios ao provedor.
- [x] Implementar a página de download e a transmissão dos arquivos pelo Worker, sem buffering completo.
- [x] Permitir retomada do download com requisições de intervalo quando suportadas.
- [x] Verificar validade e revogação antes de iniciar cada solicitação de download.
- [x] Usar arquivos individuais no MVP; o remetente pode enviar um ZIP pronto quando desejar um pacote único.
- [x] Registrar apenas eventos observáveis, sem tratar um clique como prova de download concluído ou de identidade do destinatário.

**Critério de conclusão:** o destinatário recebe um link funcional e baixa uma cópia íntegra; falhas de e-mail não obrigam o remetente a reenviar o arquivo.

### Etapa 6 — Implementar expiração, limpeza e administração

- [x] Bloquear novas solicitações de download ao atingir 48 horas, independentemente da execução da limpeza.
- [x] Implementar revogação pelo remetente e pelo administrador.
- [x] Executar limpeza periódica em lotes pequenos, compatíveis com os limites do Worker gratuito.
- [x] Remover arquivos vencidos, versões antigas e partes de uploads abandonados.
- [x] Liberar a reserva ou o espaço ocupado somente após confirmar a remoção correspondente.
- [ ] Usar regras de ciclo de vida do armazenamento como proteção adicional, sem depender delas para validar o link.
- [x] Exibir no painel espaço ocupado, reservado e pendente de exclusão, além do consumo de e-mails.
- [x] Implementar mensagens claras quando uma operação estiver bloqueada por cota.

**Critério de conclusão:** links vencidos ou revogados deixam de permitir novos downloads, e a limpeza devolve espaço sem perder a contabilidade do armazenamento.

### Etapa 7 — Alinhar o conteúdo e liberar o piloto

- [x] Ajustar os textos da landing para os limites reais: 1 GB, 48 horas e acesso por convite.
- [x] Substituir as alegações do template sobre 200 GB, armazenamento permanente, certificações e planos pagos.
- [x] Revisar depoimentos e números demonstrativos para não apresentá-los como resultados reais do serviço.
- [x] Preservar a paleta e o acabamento visual durante essas alterações.
- [x] Executar os testes de aceitação abaixo.
- [ ] Liberar o piloto para cinco amigos.
- [ ] Corrigir os problemas observados antes de ampliar os convites até 100 usuários.

**Critério de conclusão:** o serviço funciona com dados reais, comunica seus limites corretamente e interrompe operações quando necessário para permanecer nas franquias.

## 7. Modelo de dados inicial

| Registro | Responsabilidade |
| --- | --- |
| Usuários e convites | Acesso ao grupo, papel e situação do convite |
| Desafios de login | Código protegido, validade, consumo e tentativas |
| Sessões | Usuário, expiração e revogação |
| Transferências | Remetente, destinatário, mensagem, estado e validade |
| Arquivos | Nome, tamanho, localização privada e estado |
| Partes de upload | Identificadores, partes confirmadas e dados de retomada |
| Reservas e consumo | Espaço reservado, ocupado e pendente de liberação |
| E-mails pendentes | Tipo, destinatário, estado, tentativas e próxima execução |

Aplicar índices às consultas frequentes e retenção aos registros antigos para manter o banco enxuto. As mudanças de estado e os contadores que precisam permanecer consistentes serão gravados atomicamente.

## 8. Testes de aceitação

As marcações desta seção correspondem à emulação local e aos testes de falhas com rede interceptada. A repetição em Cloudflare/B2/Brevo reais continua obrigatória antes do piloto.

- [x] Envio e download de arquivos de 50 MB e 1 GB, comparando a integridade do original e da cópia.
- [x] Recusa de uma transferência acima de 1 GB.
- [x] Interrupção de conexão, retomada, recarregamento da página e cancelamento.
- [x] Dois usuários tentando reservar o último espaço disponível simultaneamente.
- [x] Tentativa de acesso a uma transferência de outro usuário pelas rotas autenticadas.
- [x] Código de login expirado, reutilizado ou com excesso de tentativas.
- [x] Link válido, inválido, expirado e revogado, inclusive com repetição de requisições.
- [x] Falha no envio do e-mail, endereço inválido e alcance do teto diário.
- [x] Exclusão com falha temporária, nova tentativa e liberação correta da cota.
- [x] Ausência de credenciais, códigos de acesso e links secretos nos logs públicos.
- [x] Comparação visual da landing e do aplicativo em desktop e celular, nos dois temas.
- [x] Navegação por teclado, foco visível e preferência por movimento reduzido.

## 9. Fora do MVP

- Cobrança, assinaturas e planos pagos.
- Armazenamento permanente e transferências de 200 GB.
- Busca por IA, conversão de vídeo e geração de previews pesados.
- Compactação de grandes conjuntos de arquivos no servidor.
- Recursos empresariais como SSO, SCIM, múltiplas regiões e certificações.
- Promessa de criptografia ponta a ponta sem uma implementação específica e validada.

## 10. Dependências, marcos e prazo

Serão necessárias contas gratuitas do Cloudflare, Backblaze e Brevo. Credenciais deverão ser configuradas como secrets no backend e nunca incluídas no repositório ou no frontend.

O comportamento gratuito do envio por e-mail sem domínio próprio depende das condições vigentes e da aprovação do remetente no Brevo. Essa dependência será validada na primeira etapa.

**Primeiro marco funcional:** um amigo convidado entra, envia um arquivo, o destinatário recebe o e-mail e baixa uma cópia íntegra.

**Marco do piloto:** o mesmo fluxo suporta arquivos de 1 GB, retomada, expiração, limpeza, controle de cotas e administração básica.

Estimativa original de planejamento: 3–6 semanas para um piloto. A implementação local já está disponível; essa estimativa não comprova o prazo restante da configuração e validação externas.

## 11. Referências técnicas

- [Cloudflare D1 — preços e comportamento das cotas](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare D1 — limites](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare Workers — limites de requisição, memória e processamento](https://developers.cloudflare.com/workers/platform/limits/)
- [Backblaze — arquivos privados por Cloudflare Workers](https://www.backblaze.com/docs/cloud-storage-deliver-private-backblaze-b2-content-through-cloudflare-cdn)
- [Backblaze — API compatível com S3](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)
- [Backblaze — controles de consumo](https://www.backblaze.com/docs/en/cloud-storage-create-and-manage-caps-and-alerts)
- [Backblaze — regras de ciclo de vida](https://www.backblaze.com/docs/cloud-storage-lifecycle-rules)
- [Brevo — limites do plano gratuito](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Brevo — condições do endereço remetente](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)

## 12. Entrega local e próximos marcos

- `npm run dev` inicia interface, API e banco local com dois convidados de teste.
- `npm run check`, `npm run test:browser`, `npm run test:large` e `npm run build` verificam a entrega.
- 50 MB e 1 GB enviados e baixados localmente, com comparação integral de SHA-256.
- Pausa, recarga e retomada verificadas no navegador sem reenviar a parte já recebida.
- Produção começa com `PILOT_ENABLED=false`; preflight verifica a configuração e exige evidências reais para a abertura do piloto.
- As três contas estão configuradas e a primeira publicação está acessível. Próximo marco externo: validar o fluxo real com um administrador. Marco seguinte: cinco amigos, antes de ampliar.
