import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./auth";
import { Empty, ThemeProvider } from "./components/ui";
import AppLayout from "./components/AppLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Send from "./pages/Send";
import History from "./pages/History";
import Admin from "./pages/Admin";
import Download from "./pages/Download";
import "./styles.css";
function Scroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = pathname.startsWith("/t/")
      ? "Arquivos para você — Cloudlight"
      : pathname === "/entrar"
        ? "Entrar — Cloudlight"
        : pathname.startsWith("/app/")
          ? "Seu espaço — Cloudlight"
          : "Cloudlight — Arquivos grandes. Caminhos curtos.";
  }, [pathname]);
  return null;
}
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Scroll />
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo
        </a>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/t/:token" element={<Download />} />
          <Route
            element={
              <AuthProvider>
                <RoutesShell />
              </AuthProvider>
            }
            path="/*"
          />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  );
}
function RoutesShell() {
  return (
    <Routes>
      <Route path="entrar" element={<Login />} />
      <Route path="app" element={<AppLayout />}>
        <Route index element={<Navigate to="enviar" replace />} />
        <Route path="enviar" element={<Send />} />
        <Route path="transferencias" element={<History />} />
        <Route path="admin" element={<Admin />} />
      </Route>
      <Route
        path="*"
        element={
          <main id="main-content" className="standalone">
            <Empty title="Esta página não está por aqui.">
              <Link className="button" to="/">
                Voltar ao início
              </Link>
            </Empty>
          </main>
        }
      />
    </Routes>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
