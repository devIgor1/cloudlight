import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Brand, CloudSurface, Icon, ThemeToggle } from "../components/ui";
import { Formats } from "../components/Formats";
const features = [
  {
    title: "Envie sem complicar",
    label: "01 / Enviar",
    description:
      "Selecione seus arquivos, deixe uma mensagem e escolha quem vai receber. Até 1 GB por transferência, direto do seu navegador.",
    icon: "upload",
  },
  {
    title: "Continue de onde parou",
    label: "02 / Retomar",
    description:
      "A conexão caiu? Retome as partes que faltam. Ao voltar à página, selecione os mesmos arquivos para continuar o envio.",
    icon: "history",
  },
  {
    title: "Compartilhe por 48 horas",
    label: "03 / Compartilhar",
    description:
      "O link chega por e-mail. Seu amigo pode baixar cada arquivo sem criar uma conta, enquanto a transferência estiver válida.",
    icon: "clock",
  },
];
const faqs = [
  [
    "Qual é o tamanho máximo?",
    "Você pode enviar até 1 GB no total por transferência, em até 20 arquivos. Para compartilhar uma pasta, compacte-a em um ZIP antes de enviar.",
  ],
  [
    "Por quanto tempo o link funciona?",
    "Por 48 horas após a conclusão de todos os arquivos. Depois disso, novos downloads são bloqueados e os arquivos entram na fila de remoção.",
  ],
  [
    "Quem recebe precisa de uma conta?",
    "Não. Qualquer pessoa com o link secreto poderá baixar os arquivos enquanto ele estiver válido. Evite encaminhá-lo se os arquivos forem pessoais.",
  ],
  [
    "Como consigo acesso?",
    "O Cloudlight é um grupo privado. Um administrador precisa adicionar seu e-mail à lista de convidados. Para entrar, você recebe um código de uso único.",
  ],
  [
    "E se meu upload for interrompido?",
    "Volte à tela de envio ou ao histórico e selecione os arquivos originais. As partes já recebidas são verificadas e você continua de onde parou. Envios incompletos podem ser retomados por até 24 horas.",
  ],
  [
    "O que acontece quando o espaço acaba?",
    "O grupo compartilha um teto operacional de 8 GB. Novos envios ficam bloqueados até que a remoção dos arquivos vencidos libere espaço. Não há ampliação automática de limites.",
  ],
];
function Preview() {
  return (
    <div
      className="product-preview"
      aria-label="Exemplo ilustrativo da interface"
    >
      <aside>
        <Brand />
        <span className="preview-nav active">
          <Icon name="upload" size={16} /> Novo envio
        </span>
        <span className="preview-nav">
          <Icon name="history" size={16} /> Transferências
        </span>
        <div className="preview-bottom">
          <small>UM ESPAÇO ENTRE AMIGOS</small>
          <span>Até 1 GB. Sem complicação.</span>
        </div>
      </aside>
      <div className="preview-content">
        <div className="preview-top">
          <span>Um novo caminho para seus arquivos</span>
          <span className="demo-label">Interface ilustrativa</span>
        </div>
        <div className="preview-inner">
          <div>
            <span className="eyebrow">PRONTO PARA IR</span>
            <h3>
              O próximo envio
              <br />
              começa aqui.
            </h3>
            <p>
              Grandes ideias merecem
              <br />
              um caminho mais leve.
            </p>
            <div className="preview-chips">
              <span>
                <Icon name="lock" size={14} /> Por convite
              </span>
              <span>
                <Icon name="clock" size={14} /> 48 horas
              </span>
            </div>
          </div>
          <div className="preview-drop">
            <span className="file-stack">
              <Icon name="file" size={37} />
            </span>
            <strong>Um arquivo. Muitas possibilidades.</strong>
            <span>Fotos, vídeos, projetos e o que mais vier.</span>
            <Link className="button" to="/app/enviar">
              Selecionar arquivos <Icon name="plus" size={16} />
            </Link>
            <small>Até 1 GB por transferência</small>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function Landing() {
  const [menu, setMenu] = useState(false),
    [tab, setTab] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <>
      <section className="hero">
        <CloudSurface />
        <header className="site-header">
          <Brand />
          <nav
            aria-label="Navegação principal"
            className={menu ? "nav-open" : ""}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setMenu(false);
                document.getElementById("menu-button")?.focus();
              }
            }}
          >
            <a onClick={() => setMenu(false)} href="#como-funciona">
              Como funciona
            </a>
            <a onClick={() => setMenu(false)} href="#seu-espaco">
              Seu espaço
            </a>
            <a onClick={() => setMenu(false)} href="#perguntas">
              Perguntas
            </a>
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            <Link className="button small" to="/entrar">
              Entrar <Icon name="arrow" size={15} />
            </Link>
            <button
              id="menu-button"
              className="icon-button mobile-menu"
              aria-label="Menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Icon name={menu ? "close" : "menu"} />
            </button>
          </div>
        </header>
        <div className="hero-copy">
          <span className="pill">
            Um espaço privado, entre amigos <Icon name="arrow" size={13} />
          </span>
          <h1>
            Arquivos grandes.
            <br />
            Caminhos curtos.
          </h1>
          <p>
            Envie o que importa para quem importa.
            <br />
            Até 1 GB, um link e 48 horas para baixar.
          </p>
          <div className="actions">
            <Link className="button" to="/app/enviar">
              Começar um envio <Icon name="arrow" size={17} />
            </Link>
            <a className="button glass" href="#como-funciona">
              Veja como funciona
            </a>
          </div>
        </div>
        <Preview />
      </section>
      <main id="main-content">
        <section className="intro-strip section-width">
          <span>
            Menos anexos.
            <br />
            <strong>Mais possibilidades.</strong>
          </span>
          <div>
            <b>1 GB</b>
            <small>por transferência</small>
          </div>
          <div>
            <b>48 h</b>
            <small>para baixar</small>
          </div>
          <div>
            <Icon name="users" size={28} />
            <small>acesso por convite</small>
          </div>
        </section>
        <section id="como-funciona" className="feature-section section-width">
          <div className="section-heading">
            <span className="eyebrow">SIMPLES DO INÍCIO AO FIM</span>
            <h2>
              Selecione. Envie.
              <br />
              Deixe o resto fluir.
            </h2>
            <p>
              Um pequeno espaço para compartilhar
              <br />
              as coisas que não cabem em um anexo.
            </p>
          </div>
          <div className="feature-layout">
            <div
              role="tablist"
              aria-label="Etapas de uma transferência"
              className="feature-tabs"
            >
              {features.map((f, i) => (
                <button
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  id={`tab-${i}`}
                  role="tab"
                  aria-selected={tab === i}
                  aria-controls={`panel-${i}`}
                  tabIndex={tab === i ? 0 : -1}
                  key={f.label}
                  className={tab === i ? "selected" : ""}
                  onClick={() => setTab(i)}
                  onKeyDown={(e) => {
                    let n = i;
                    if (e.key === "ArrowRight" || e.key === "ArrowDown")
                      n = (i + 1) % 3;
                    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                      n = (i + 2) % 3;
                    else if (e.key === "Home") n = 0;
                    else if (e.key === "End") n = 2;
                    else return;
                    e.preventDefault();
                    setTab(n);
                    tabs.current[n]?.focus();
                  }}
                >
                  <span className="eyebrow">{f.label}</span>
                  <strong>{f.title}</strong>
                  <p>{f.description}</p>
                </button>
              ))}
            </div>
            <div
              className="feature-art"
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
              tabIndex={0}
            >
              <CloudSurface kind="wave" />
              <div className="floating-card" key={tab}>
                <div className="art-icon">
                  <Icon name={features[tab].icon} size={35} />
                </div>
                <span className="eyebrow">{features[tab].label}</span>
                <h3>{features[tab].title}</h3>
                <div className="sample-file">
                  <Icon name="file" />
                  <div>
                    <strong>boas-memórias.zip</strong>
                    <small>Exemplo de arquivo · 128 MB</small>
                  </div>
                  <Icon name="check" />
                </div>
                <div className="sample-progress">
                  <span />
                </div>
                <small>
                  {
                    [
                      "Tudo pronto para começar",
                      "Suas partes já enviadas continuam aqui",
                      "Um link, disponível por 48 horas",
                    ][tab]
                  }
                </small>
              </div>
            </div>
          </div>
        </section>
        <Formats />
        <section id="seu-espaco" className="privacy section-width">
          <div className="section-heading">
            <span className="eyebrow">PEQUENO POR ESCOLHA</span>
            <h2>
              Seu círculo.
              <br />
              Seu espaço.
            </h2>
            <p>
              Compartilhar pode ser simples,
              <br />
              com limites que todo mundo entende.
            </p>
          </div>
          <div className="privacy-grid">
            {[
              [
                "lock",
                "Um grupo privado",
                "Só pessoas convidadas podem enviar. O acesso usa um código temporário no seu e-mail.",
              ],
              [
                "clock",
                "Só pelo tempo necessário",
                "Os links duram 48 horas. Você também pode revogar um envio antes de ele vencer.",
              ],
              [
                "users",
                "Espaço compartilhado",
                "O grupo divide 8 GB de espaço operacional. Ao atingir o teto, novos envios aguardam a liberação.",
              ],
            ].map(([icon, title, text]) => (
              <article key={title}>
                <Icon name={icon} size={24} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="notice">
            O link dá acesso aos arquivos. Quem o receber por encaminhamento
            também poderá baixar enquanto ele estiver válido.
          </div>
        </section>
        <section id="perguntas" className="faq section-width">
          <div>
            <span className="eyebrow">ANTES DO PRIMEIRO ENVIO</span>
            <h2>Bom saber.</h2>
          </div>
          <div className="faq-items">
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Icon name="plus" size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="bottom-cta">
          <CloudSurface />
          <span className="eyebrow">DO SEU LADO PARA O OUTRO</span>
          <h2>
            Faça seus arquivos
            <br />
            chegarem mais longe.
          </h2>
          <Link className="button" to="/app/enviar">
            Começar um envio <Icon name="arrow" size={17} />
          </Link>
          <span className="cta-note">
            Para amigos convidados. Sem assinatura.
          </span>
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <span>Um jeito leve de compartilhar.</span>
        <div>
          <a href="#perguntas">Perguntas</a>
          <ThemeToggle />
        </div>
      </footer>
    </>
  );
}
