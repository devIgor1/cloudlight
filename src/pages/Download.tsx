import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { bytes } from "../../shared/contracts";
import { api, errorText } from "../api";
import {
  Brand,
  CloudSurface,
  ErrorNotice,
  Icon,
  Loading,
  ThemeToggle,
  date,
} from "../components/ui";
type PublicTransfer = {
  sender: string;
  message: string;
  expires_at: number;
  total_bytes: number;
  files: { id: string; name: string; size: number }[];
};
export default function Download() {
  const { token } = useParams();
  const [data, setData] = useState<PublicTransfer | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<PublicTransfer>(`/public/${token}`)
      .then((t) => {
        if (alive) setData(t);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [token]);
  const expired = data && data.expires_at <= now;
  return (
    <div className="download-page">
      <CloudSurface />
      <header>
        <Brand />
        <ThemeToggle />
      </header>
      <main id="main-content" className="download-card">
        {loading ? (
          <Loading />
        ) : error || expired ? (
          <>
            <div className="art-icon">
              <Icon name="clock" size={32} />
            </div>
            <h1>Este caminho não está disponível.</h1>
            <ErrorNotice
              message={
                expired ? "Este link expirou. Peça um novo envio." : error
              }
            />
            <Link className="button secondary" to="/">
              Conhecer o Cloudlight
            </Link>
          </>
        ) : (
          data && (
            <>
              <span className="eyebrow">UMA ENTREGA PARA VOCÊ</span>
              <h1>
                {data.sender}
                <br />
                enviou arquivos.
              </h1>
              <p className="download-subtitle">
                {data.files.length} arquivo(s) · {bytes(data.total_bytes)} · sem
                cadastro
              </p>
              {data.message && <blockquote>{data.message}</blockquote>}
              <div className="expiry-note">
                <Icon name="clock" />
                <div>
                  <strong>Disponível até {date(data.expires_at)}</strong>
                  <small>
                    Restam cerca de{" "}
                    {Math.max(1, Math.ceil((data.expires_at - now) / 3600_000))}{" "}
                    hora(s).
                  </small>
                </div>
              </div>
              <div className="download-files">
                {data.files.map((f) => (
                  <div className="file-row" key={f.id}>
                    <span className="file-icon">
                      <Icon name="file" />
                    </span>
                    <div>
                      <strong>{f.name}</strong>
                      <small>{bytes(f.size)}</small>
                    </div>
                    <a
                      className="button secondary small"
                      href={`/api/public/${token}/files/${f.id}`}
                      download
                      referrerPolicy="no-referrer"
                      aria-label={`Baixar ${f.name}`}
                    >
                      <Icon name="download" size={17} />
                      <span>Baixar</span>
                    </a>
                  </div>
                ))}
              </div>
              <p className="fineprint muted">
                Guarde uma cópia antes do prazo. Qualquer pessoa com este link
                poderá baixar os arquivos enquanto ele estiver válido.
              </p>
            </>
          )
        )}
      </main>
      <footer>Cloudlight · Um jeito leve de compartilhar.</footer>
    </div>
  );
}
