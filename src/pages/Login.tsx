import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, errorText, post } from "../api";
import { useAuth } from "../auth";
import {
  Brand,
  CloudSurface,
  ErrorNotice,
  Icon,
  ThemeToggle,
} from "../components/ui";
type Mail = { id: string; recipient: string; subject: string; text: string };
export default function Login() {
  const [email, setEmail] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [local, setLocal] = useState(false),
    [inbox, setInbox] = useState<Mail[]>([]),
    [sentAt, setSentAt] = useState(0),
    [now, setNow] = useState(Date.now());
  const { user, refresh } = useAuth(),
    navigate = useNavigate();
  useEffect(() => {
    api<{ local: boolean }>("/health")
      .then((r) => setLocal(r.local))
      .catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (user) return <Navigate to="/app/enviar" replace />;
  async function request() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ challengeId: string }>("/auth/request", {
        email,
      });
      setChallenge(result.challengeId);
      setCode("");
      setSentAt(Date.now());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return request();
    setBusy(true);
    setError("");
    try {
      await post("/auth/verify", { challengeId: challenge, code });
      await refresh();
      navigate("/app/enviar");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const seconds = Math.max(0, Math.ceil((sentAt + 60000 - now) / 1000));
  return (
    <div className="login-page">
      <div className="login-art">
        <CloudSurface />
        <Brand />
        <div>
          <span className="pill">Um espaço entre amigos</span>
          <h1>
            Um código.
            <br />
            Muitas possibilidades.
          </h1>
          <p>
            Suas fotos, projetos e boas ideias.
            <br />
            Um caminho simples para compartilhar.
          </p>
        </div>
        <span>Cloudlight · Arquivos grandes. Caminhos curtos.</span>
      </div>
      <main id="main-content" className="login-form-wrap">
        <div className="login-top">
          <Link to="/">← Início</Link>
          <ThemeToggle />
        </div>
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">BOM TER VOCÊ AQUI</span>
          <h2>{challenge ? "Confira seu e-mail." : "Entre no seu espaço."}</h2>
          <p>
            {challenge
              ? `Se ${email} estiver na lista de convidados, um código chegará em instantes. Ele vale por 10 minutos.`
              : "Informe o e-mail que recebeu o convite. Enviaremos um código para você entrar."}
          </p>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              required
              disabled={!!challenge || busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </label>
          {challenge && (
            <label>
              Código de acesso
              <input
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="code-input"
                placeholder="000000"
              />
            </label>
          )}
          <ErrorNotice message={error} />
          <button className="button full" disabled={busy}>
            {busy ? "Aguarde…" : challenge ? "Entrar" : "Receber código"}
            <Icon name="arrow" size={17} />
          </button>
          {challenge && (
            <div className="login-links">
              <button
                type="button"
                className="text-button"
                disabled={busy || seconds > 0}
                onClick={() => void request()}
              >
                {seconds ? `Reenviar em ${seconds}s` : "Reenviar código"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setChallenge("");
                  setError("");
                }}
              >
                Usar outro e-mail
              </button>
            </div>
          )}
          <small className="form-footnote">
            <Icon name="lock" size={14} /> O acesso é restrito a pessoas
            convidadas.
          </small>
        </form>
        {local && (
          <div className="local-inbox">
            <strong>Caixa de e-mail local</strong>
            <p>
              Para testar, entre com <code>admin@cloudlight.test</code> ou{" "}
              <code>amigo@cloudlight.test</code>.
            </p>
            <button
              className="button secondary small"
              onClick={async () => {
                try {
                  setInbox(await api<Mail[]>("/dev/inbox"));
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Ver e-mails de teste
            </button>
            {inbox.map((m) => (
              <article key={m.id}>
                <small>Para: {m.recipient}</small>
                <strong>{m.subject}</strong>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
