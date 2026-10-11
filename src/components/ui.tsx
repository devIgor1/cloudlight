import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { createSurface } from "./gl-surface";
export function Icon({
  name = "cloud",
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    cloud: (
      <path d="M7.5 18.8h9.3a5 5 0 0 0 .7-9.95A6.9 6.9 0 0 0 5.3 8.6 5.3 5.3 0 0 0 7.5 18.8Z" />
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
      </>
    ),
    file: (
      <>
        <path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8m-8 4h6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    history: (
      <>
        <path d="M3 4v6h6M3 10a9 9 0 1 1 1 8m8-12v6l4 2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m0-16a3 3 0 0 1 0 6m3 4a5 5 0 0 1 3 4v2" />
      </>
    ),
    download: <path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "cloud" ? "currentColor" : "none"}
      stroke={name === "cloud" ? "none" : "currentColor"}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.file}
    </svg>
  );
}
export const Brand = () => (
  <Link className="brand" to="/" aria-label="Cloudlight, início">
    <Icon size={28} />
    <span>Cloudlight</span>
  </Link>
);
const ThemeContext = createContext({ dark: false, toggle: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("cloudlight-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark((d) => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeToggle() {
  const { dark, toggle } = useContext(ThemeContext);
  return (
    <button
      className="icon-button"
      onClick={toggle}
      aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
export function CloudSurface({ kind = "cloud" }: { kind?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    createSurface(
      ref.current!,
      matchMedia("(prefers-reduced-motion: reduce)"),
      controller.signal,
    )
      .then((fn) => {
        if (controller.signal.aborted) fn?.();
        else dispose = fn;
      })
      .catch(() => {});
    return () => {
      controller.abort();
      dispose?.();
    };
  }, [kind]);
  return (
    <div
      ref={ref}
      className={`cloud-surface ${kind}`}
      data-shader={kind}
      aria-hidden="true"
    />
  );
}
export const ErrorNotice = ({ message }: { message: string }) =>
  message ? (
    <div className="notice error" role="alert">
      {message}
    </div>
  ) : null;
export const Loading = () => (
  <div className="loading" role="status">
    <span className="spinner" />
    Carregando…
  </div>
);
export function Empty({
  title,
  children,
  icon = "cloud",
}: {
  title: string;
  children?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export const date = (n: number) =>
  new Date(n).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
export const statusLabel: Record<string, string> = {
  uploading: "Em envio",
  ready: "Disponível",
  expired: "Expirado",
  revoked: "Revogado",
  cancelled: "Cancelado",
  deleted: "Removido",
  pending: "Na fila",
  sending: "Enviando",
  sent: "Aceito pelo e-mail",
  failed: "Falha no e-mail",
};
export const Badge = ({ status }: { status: string }) => (
  <span className={`badge ${status}`}>{statusLabel[status] || status}</span>
);
