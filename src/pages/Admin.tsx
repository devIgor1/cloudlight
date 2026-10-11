import { useEffect, useState, type FormEvent } from "react";
import {
  bytes,
  LIMITS,
  type Transfer,
  type User,
} from "../../shared/contracts";
import { api, errorText, post } from "../api";
import { useAuth } from "../auth";
import { Badge, Empty, ErrorNotice, Loading } from "../components/ui";
import { TransferList } from "./History";
type Overview = {
  usage: {
    reserved: number;
    occupied: number;
    pending: number;
    emails: number;
    operations: number;
  };
  users: User[];
  transfers: Transfer[];
  pendingMail: {
    id: string;
    recipient: string;
    status: string;
    attempts: number;
    last_error: string;
  }[];
};
export default function Admin() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      setData(await api<Overview>("/admin/overview"));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user?.role]);
  if (user?.role !== "admin")
    return (
      <main id="main-content" className="page-content">
        <Empty title="Esta área é do administrador." icon="lock">
          <p>
            Você pode enviar arquivos e acompanhar suas próprias transferências.
          </p>
        </Empty>
      </main>
    );
  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await post("/admin/invites", { email, name });
      setEmail("");
      setName("");
      setNotice(
        "Convidado adicionado. Ele já pode solicitar um código de acesso com esse e-mail.",
      );
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className="page-content admin-page">
      <div className="page-heading heading-row">
        <div>
          <span className="eyebrow">CUIDANDO DO ESPAÇO</span>
          <h1>Visão do grupo.</h1>
          <p>Convites, consumo e o que precisa de atenção.</p>
        </div>
        <button className="button secondary small" onClick={() => void load()}>
          Atualizar
        </button>
      </div>
      <ErrorNotice message={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <section className="stats-grid">
            {[
              ["Armazenado", bytes(data.usage.occupied)],
              ["Reservado", bytes(data.usage.reserved)],
              ["Aguardando remoção", bytes(data.usage.pending)],
              ["E-mails hoje", `${data.usage.emails} / ${LIMITS.emails}`],
            ].map(([title, value]) => (
              <article key={title}>
                <small>{title}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          <div className="quota-meter">
            <progress
              value={
                data.usage.occupied + data.usage.reserved + data.usage.pending
              }
              max={LIMITS.storage}
              aria-label="Uso de armazenamento do grupo"
            />
            <small>
              {bytes(
                data.usage.occupied + data.usage.reserved + data.usage.pending,
              )}{" "}
              de 8 GB · {data.usage.operations} de {LIMITS.operations} operações
              de armazenamento no dia UTC
            </small>
          </div>
          <div className="admin-columns">
            <section className="panel">
              <h2>Convidar um amigo</h2>
              <p>{data.users.length} de 100 lugares no grupo.</p>
              <form onSubmit={invite}>
                <label>
                  Nome
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                    placeholder="Como seu amigo se chama?"
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="amigo@exemplo.com"
                  />
                </label>
                <button
                  className="button"
                  disabled={busy || data.users.length >= 100}
                >
                  {busy ? "Adicionando…" : "Adicionar convidado"}
                </button>
              </form>
            </section>
            <section className="panel">
              <h2>Manutenção</h2>
              <p>
                A limpeza remove um arquivo por execução. O espaço só volta a
                ficar disponível após a confirmação da remoção.
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const result = await post<{
                      removed: number;
                      failed: number;
                    }>("/admin/maintenance");
                    setNotice(
                      `Manutenção concluída: ${result.removed} arquivo(s) removido(s), ${result.failed} tentativa(s) pendente(s). Autorizações recentes aguardam expirar antes da remoção.`,
                    );
                    await load();
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Processar e-mails e limpeza
              </button>
              <small className="muted">
                Na produção, a rotina executa a cada 5 minutos.
              </small>
            </section>
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          <section className="panel">
            <h2>Pessoas no grupo</h2>
            <div className="users-list">
              {data.users.map((u) => (
                <div className="user-row" key={u.id}>
                  <span className="avatar">{u.name[0]}</span>
                  <div>
                    <strong>{u.name}</strong>
                    <small>
                      {u.email} ·{" "}
                      {u.role === "admin"
                        ? "Administrador"
                        : u.active
                          ? "Convidado ativo"
                          : "Desativado"}
                    </small>
                  </div>
                  {u.id !== user?.id && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(`/admin/users/${u.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ active: !u.active }),
                          });
                          await load();
                        } catch (e) {
                          setError(errorText(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {u.active ? "Desativar" : "Reativar"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
          {data.pendingMail.length > 0 && (
            <section className="panel">
              <h2>E-mails que precisam de atenção</h2>
              {data.pendingMail.map((m) => (
                <div className="mail-row" key={m.id}>
                  <span>{m.recipient}</span>
                  <Badge status={m.status} />
                  <small>
                    {m.attempts} tentativa(s)
                    {m.last_error === "DAILY_QUOTA"
                      ? " · Cota diária atingida"
                      : ""}
                  </small>
                  {m.status === "failed" && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await post(`/admin/mail/${m.id}/retry`);
                          await load();
                        } catch (e) {
                          setError(errorText(e));
                        }
                      }}
                    >
                      Tentar novamente
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          <section>
            <h2 className="section-subtitle">
              Transferências recentes do grupo
            </h2>
            <TransferList items={data.transfers} onChange={() => void load()} />
          </section>
        </>
      )}
    </main>
  );
}
