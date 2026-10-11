import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth";
import { Brand, ErrorNotice, Icon, Loading, ThemeToggle } from "./ui";
import { errorText } from "../api";
export default function AppLayout() {
  const { user, loading, error, refresh, logout, local } = useAuth();
  const [exitError, setExitError] = useState("");
  const navigate = useNavigate();
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="standalone">
        <ErrorNotice message={error} />
        <button className="button" onClick={() => void refresh()}>
          Tentar novamente
        </button>
      </div>
    );
  if (!user) return <Navigate to="/entrar" replace />;
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Brand />
        <span className="sidebar-caption">SEU ESPAÇO</span>
        <nav aria-label="Aplicativo">
          <NavLink to="/app/enviar">
            <Icon name="upload" />
            Novo envio
          </NavLink>
          <NavLink to="/app/transferencias">
            <Icon name="history" />
            Transferências
          </NavLink>
          {user.role === "admin" && (
            <NavLink to="/app/admin">
              <Icon name="users" />
              Administração
            </NavLink>
          )}
        </nav>
        <div className="sidebar-note">
          <Icon name="cloud" size={37} />
          <h3>
            Boas coisas
            <br />
            merecem ser compartilhadas.
          </h3>
          <p>
            Até 1 GB por envio.
            <br />
            48 horas para baixar.
          </p>
        </div>
        <div className="user-block">
          <span className="avatar">{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <ThemeToggle />
        </div>
        <button
          className="text-button"
          onClick={async () => {
            try {
              await logout();
              navigate("/entrar");
            } catch (e) {
              setExitError(errorText(e));
            }
          }}
        >
          Sair da conta
        </button>
        <ErrorNotice message={exitError} />
      </aside>
      <div className="app-main">
        {local && (
          <div className="local-banner">
            <span className="status-dot" /> Ambiente local · arquivos e e-mails
            de teste
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
