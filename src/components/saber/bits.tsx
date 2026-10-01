import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

export function Frame({
  online,
  status,
  projecting,
  children,
}: {
  online: boolean;
  status: string;
  projecting?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={projecting ? "projecting" : undefined}>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark"><BookOpen aria-hidden="true" /></span>
          <span>Saber em Jogo</span>
        </Link>
        <p className="connection" role="status">
          <i data-state={online ? "live" : "wait"} />
          <span>{status}</span>
        </p>
      </header>
      <main className="page">{children}</main>
      <footer className="footer quiet-project">
        Aprender, participar, descobrir. ·{" "}
        <Link to="/privacidade">Privacidade</Link>
      </footer>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero">
      <div>
        <p className="kicker">Sala de aula, em modo jogo</p>
        <h1>
          Conhecimento bom é <em>conhecimento em movimento.</em>
        </h1>
        <p>O professor prepara. A turma entra com um código. Todo mundo acompanha a partida ao vivo.</p>
      </div>
      <img className="hero-art" src="/images/sala-conectada.png" alt="Professora e estudantes conectados em uma atividade de aprendizagem" width="1536" height="1024" />
    </section>
  );
}

export function Flash({ kind, text }: { kind: "info" | "error"; text: string }) {
  if (!text) return null;
  return (
    <p className="flash" data-kind={kind} role="status">
      {text}
    </p>
  );
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="spread">
          <h2>{title}</h2>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="stack modal-body">{children}</div>
      </div>
    </div>
  );
}

export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function remainingSeconds(deadlineMs: number | null, serverNowMs: number, now: number) {
  if (!deadlineMs) return null;
  const offset = serverNowMs - now;
  return Math.max(0, Math.ceil((deadlineMs - (Date.now() + offset)) / 1000));
}
