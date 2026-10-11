import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Transfer } from "../../shared/contracts";
import { bytes } from "../../shared/contracts";
import { api, errorText, post } from "../api";
import {
  Badge,
  Empty,
  ErrorNotice,
  Icon,
  Loading,
  date,
} from "../components/ui";
export function TransferList({
  items,
  onChange,
}: {
  items: Transfer[];
  onChange: () => void;
}) {
  const [error, setError] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(""),
    [copied, setCopied] = useState("");
  return (
    <>
      <ErrorNotice message={error} />
      <div className="transfer-list">
        {items.map((t) => (
          <article className="transfer-card" key={t.id}>
            <div className="transfer-title">
              <span className="file-icon">
                <Icon name="file" size={23} />
              </span>
              <div>
                <h2>{t.recipient}</h2>
                <small>{t.files.map((f) => f.name).join(", ")}</small>
              </div>
              <Badge status={t.status} />
            </div>
            <div className="transfer-meta">
              <span>
                {bytes(t.total_bytes)} · {t.files.length} arquivo(s)
              </span>
              <span>
                {t.expires_at
                  ? `Disponível até ${date(t.expires_at)}`
                  : `Criado em ${date(t.created_at)}`}
              </span>
            </div>
            <div className="transfer-actions">
              <span>
                {t.mail_status ? (
                  <Badge status={t.mail_status} />
                ) : (
                  <small>O link será criado ao concluir o envio.</small>
                )}
              </span>
              <div>
                {t.status === "uploading" && (
                  <Link
                    className="button secondary small"
                    to={`/app/enviar?resume=${t.id}`}
                  >
                    Retomar
                  </Link>
                )}
                {t.link && (
                  <button
                    className="button secondary small"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(t.link!);
                        setCopied(t.id);
                      } catch {
                        setError("Não foi possível copiar o link.");
                      }
                    }}
                  >
                    {copied === t.id ? "Copiado" : "Copiar link"}
                  </button>
                )}
                {["uploading", "ready"].includes(t.status) && (
                  <button
                    className="text-button danger"
                    disabled={busy === t.id}
                    onClick={() => setConfirm(t.id)}
                  >
                    Revogar
                  </button>
                )}
              </div>
            </div>
            {confirm === t.id && (
              <div className="confirm-revoke" role="alert">
                <span>
                  Bloquear novos downloads e remover os arquivos deste envio?
                </span>
                <button
                  className="button small"
                  disabled={busy === t.id}
                  onClick={async () => {
                    setBusy(t.id);
                    try {
                      await post(`/transfers/${t.id}/revoke`);
                      setConfirm("");
                      onChange();
                    } catch (e) {
                      setError(errorText(e));
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Sim, revogar
                </button>
                <button className="text-button" onClick={() => setConfirm("")}>
                  Voltar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
export default function History() {
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Transfer[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    try {
      setItems(await api<Transfer[]>(`/transfers?offset=${offset}`));
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [offset]);
  return (
    <main id="main-content" className="page-content">
      <div className="page-heading heading-row">
        <div>
          <span className="eyebrow">O QUE JÁ SEGUIU VIAGEM</span>
          <h1>Suas transferências.</h1>
          <p>Arquivos, prazos e entregas. Tudo no mesmo lugar.</p>
        </div>
        <button className="button secondary small" onClick={() => void load()}>
          Atualizar
        </button>
      </div>
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : items.length ? (
        <TransferList items={items} onChange={() => void load()} />
      ) : (
        <Empty title="Seu primeiro envio começa aqui." icon="history">
          <p>As transferências que você criar vão aparecer neste espaço.</p>
          <Link className="button" to="/app/enviar">
            Enviar arquivos <Icon name="arrow" size={17} />
          </Link>
        </Empty>
      )}
      <div className="actions" style={{ marginTop: 24 }}>
        <button
          className="button secondary small"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Anterior
        </button>
        <span className="muted fineprint">Página {offset / 20 + 1}</span>
        <button
          className="button secondary small"
          disabled={items.length < 20}
          onClick={() => setOffset(offset + 20)}
        >
          Próxima
        </button>
      </div>
      <p className="muted fineprint">
        O status do e-mail indica aceitação pelo provedor, não leitura. Uma
        solicitação de arquivo não comprova um download concluído.
      </p>
    </main>
  );
}
