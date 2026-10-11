import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { bytes, LIMITS, type Transfer } from "../../shared/contracts";
import { api, errorText, post } from "../api";
import { useAuth } from "../auth";
import { Badge, ErrorNotice, Icon, date } from "../components/ui";
import { uploadTransfer } from "../upload";
type Draft = {
  requestId: string;
  transferId?: string;
  recipient: string;
  message: string;
};
export default function Send() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const key = `cloudlight-draft:${user!.id}`;
  const [files, setFiles] = useState<File[]>([]),
    [recipient, setRecipient] = useState(""),
    [message, setMessage] = useState(""),
    [transfer, setTransfer] = useState<Transfer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(0),
    [drag, setDrag] = useState(false),
    [copied, setCopied] = useState(false),
    [loading, setLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    draft = useRef<Draft | null>(null),
    cancelled = useRef(false);
  function save(d: Draft) {
    draft.current = d;
    try {
      localStorage.setItem(key, JSON.stringify(d));
    } catch {}
  }
  function clear() {
    draft.current = null;
    try {
      localStorage.removeItem(key);
    } catch {}
    setTransfer(null);
    setFiles([]);
    setRecipient("");
    setMessage("");
    setSent(0);
    setCopied(false);
    setError("");
    setParams({});
  }
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const saved = localStorage.getItem(key);
        const data: Draft | null = saved ? JSON.parse(saved) : null;
        draft.current = data;
        const tid = params.get("resume") || data?.transferId;
        if (tid) {
          const t = await api<Transfer>(`/transfers/${tid}`);
          if (live) {
            setTransfer(t);
            setRecipient(t.recipient);
            setMessage(t.message);
            save({
              requestId: data?.requestId || crypto.randomUUID(),
              transferId: t.id,
              recipient: t.recipient,
              message: t.message,
            });
          }
        } else if (data) {
          setRecipient(data.recipient);
          setMessage(data.message);
        }
      } catch (e) {
        if (live) setError(errorText(e));
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
      controller.current?.abort();
    };
  }, [key]);
  function select(incoming: FileList | null) {
    if (!incoming) return;
    const next = transfer ? [...incoming] : [...files, ...incoming];
    if (next.length > LIMITS.files) {
      setError("Escolha até 20 arquivos por transferência.");
      return;
    }
    if (new Set(next.map((f) => f.name)).size !== next.length) {
      setError("Os arquivos precisam ter nomes diferentes.");
      return;
    }
    if (next.some((f) => f.size === 0)) {
      setError("Escolha arquivos que não estejam vazios.");
      return;
    }
    if (next.reduce((s, f) => s + f.size, 0) > LIMITS.transfer) {
      setError("O limite é de 1 GB na soma de todos os arquivos.");
      return;
    }
    setFiles(next);
    setError("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    cancelled.current = false;
    const abort = new AbortController();
    controller.current = abort;
    try {
      let current = transfer;
      if (!current) {
        if (!files.length) throw new Error("Selecione pelo menos um arquivo.");
        const d = draft.current || {
          requestId: crypto.randomUUID(),
          recipient,
          message,
        };
        save({ ...d, recipient, message });
        current = await post<Transfer>("/transfers", {
          requestId: d.requestId,
          recipient,
          message,
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
            lastModified: f.lastModified,
          })),
        });
        setTransfer(current);
        save({ ...d, recipient, message, transferId: current.id });
      }
      abort.signal.throwIfAborted();
      const result = await uploadTransfer(
        current,
        files,
        abort.signal,
        setSent,
      );
      if (!cancelled.current) {
        setTransfer(result);
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    } catch (e) {
      if (!cancelled.current)
        setError(
          controller.current?.signal.aborted
            ? "Envio pausado. As partes recebidas continuam salvas."
            : errorText(e),
        );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    cancelled.current = true;
    controller.current?.abort();
    setBusy(true);
    try {
      if (transfer) await post(`/transfers/${transfer.id}/revoke`);
      clear();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const ready = transfer?.status === "ready",
    total = transfer?.total_bytes || files.reduce((n, f) => n + f.size, 0),
    progress = total ? Math.min(100, Math.floor((sent / total) * 100)) : 0;
  return (
    <main id="main-content" className="page-content">
      <div className="page-heading">
        <h1>
          {ready ? "Tudo pronto para chegar." : "O que vamos compartilhar?"}
        </h1>
        <p>
          {ready
            ? "Seus arquivos estão disponíveis. Acompanhe o e-mail no histórico."
            : "Escolha seus arquivos e deixe uma mensagem. A gente cuida do caminho."}
        </p>
      </div>
      {loading ? (
        <p role="status">Buscando seu último envio…</p>
      ) : ready ? (
        <section className="success-card">
          <span className="success-icon">
            <Icon name="check" size={35} />
          </span>
          <h2>Seus arquivos já têm destino.</h2>
          <p>
            {bytes(total)} para <strong>{transfer.recipient}</strong>
          </p>
          <Badge status={transfer.mail_status || "pending"} />
          <p>Disponível até {date(transfer.expires_at!)}.</p>
          <div className="link-box">
            <input
              aria-label="Link da transferência"
              readOnly
              value={transfer.link || ""}
            />
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(transfer.link!);
                  setCopied(true);
                } catch {
                  setError(
                    "Não foi possível copiar. Selecione o link e copie manualmente.",
                  );
                }
              }}
            >
              {copied ? "Copiado" : "Copiar link"}
            </button>
          </div>
          <small>Qualquer pessoa com o link poderá baixar os arquivos.</small>
          <div className="actions">
            <button className="button secondary" onClick={clear}>
              Enviar mais arquivos
            </button>
            <Link className="text-button" to="/app/transferencias">
              Ver transferências <Icon name="arrow" size={16} />
            </Link>
          </div>
          <ErrorNotice message={error} />
        </section>
      ) : transfer && transfer.status !== "uploading" ? (
        <section className="success-card">
          <h2>Este envio foi encerrado.</h2>
          <Badge status={transfer.status} />
          <button className="button" onClick={clear}>
            Começar outro envio
          </button>
        </section>
      ) : (
        <form onSubmit={submit} className="send-grid">
          <div className="send-files">
            <div
              className={`drop-zone ${drag ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!busy) select(e.dataTransfer.files);
              }}
            >
              <span className="upload-illustration">
                <Icon name="file" size={50} />
                <span>
                  <Icon name="plus" size={18} />
                </span>
              </span>
              <h2>
                {transfer
                  ? "Vamos continuar de onde parou."
                  : "Pode soltar seus arquivos aqui."}
              </h2>
              <p>
                {transfer
                  ? "Selecione novamente os arquivos originais para retomar."
                  : "Fotos, vídeos, documentos ou um ZIP com tudo."}
              </p>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {transfer ? "Selecionar originais" : "Selecionar arquivos"}
                <Icon name="plus" size={16} />
              </button>
              <input
                className="visually-hidden"
                tabIndex={-1}
                ref={input}
                type="file"
                aria-label="Arquivos para enviar"
                multiple
                onChange={(e) => {
                  select(e.target.files);
                  e.target.value = "";
                }}
              />
              <small>Até 1 GB no total · até 20 arquivos</small>
            </div>
            {(transfer?.files || files).length > 0 && (
              <div className="file-list">
                {(transfer?.files || files).map((f, i) => (
                  <div className="file-row" key={`${f.name}-${i}`}>
                    <span className="file-icon">
                      <Icon name="file" />
                    </span>
                    <div>
                      <strong>{f.name}</strong>
                      <small>
                        {bytes(f.size)}
                        {transfer && files.some((s) => s.name === f.name)
                          ? " · Original selecionado"
                          : ""}
                      </small>
                    </div>
                    {!transfer && (
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Remover ${f.name}`}
                        onClick={() =>
                          setFiles(files.filter((_, j) => i !== j))
                        }
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="file-summary">
              <span>{(transfer?.files || files).length} arquivo(s)</span>
              <strong>
                {bytes(total)} <span>/ 1 GB</span>
              </strong>
            </div>
            {transfer && (
              <div className="upload-progress" aria-live="polite">
                <div>
                  <strong>
                    {busy ? "Enviando e verificando…" : "Pronto para retomar"}
                  </strong>
                  <span>{progress}%</span>
                </div>
                <progress
                  max="100"
                  value={progress}
                  aria-label="Progresso do envio"
                />
                <small>
                  {bytes(sent)} de {bytes(total)} · a integridade é verificada
                  antes da liberação
                </small>
              </div>
            )}
          </div>
          <div className="send-details">
            <div className="card-heading">
              <span className="step-number">02</span>
              <h2>Para quem vai?</h2>
            </div>
            <label>
              E-mail do destinatário
              <input
                type="email"
                autoComplete="email"
                required
                value={recipient}
                disabled={busy || !!transfer}
                placeholder="amigo@exemplo.com"
                onChange={(e) => setRecipient(e.target.value)}
              />
            </label>
            <label>
              Uma mensagem <span className="optional">opcional</span>
              <textarea
                rows={5}
                maxLength={2000}
                value={message}
                disabled={busy || !!transfer}
                placeholder="Um pequeno recado para acompanhar seus arquivos…"
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <div className="expiry-note">
              <Icon name="clock" />
              <div>
                <strong>48 horas para baixar</strong>
                <small>A partir da conclusão do envio.</small>
              </div>
            </div>
            <ErrorNotice message={error} />
            {busy ? (
              <button
                type="button"
                className="button full"
                onClick={() => controller.current?.abort()}
              >
                Pausar envio
              </button>
            ) : (
              <button
                className="button full"
                disabled={
                  (!files.length && !transfer) || total > LIMITS.transfer
                }
              >
                {transfer ? "Retomar envio" : "Enviar arquivos"}
                <Icon name="arrow" size={17} />
              </button>
            )}
            {transfer && (
              <button
                className="text-button full"
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
              >
                Cancelar transferência
              </button>
            )}
            <p className="form-footnote">
              <Icon name="lock" size={14} /> O destinatário recebe um link
              secreto por e-mail.
            </p>
          </div>
        </form>
      )}
      <div className="page-bottom-note">
        <Icon name="cloud" size={18} />
        <span>
          Um espaço compartilhado. Arquivos com prazo para seguir viagem.
        </span>
      </div>
    </main>
  );
}
