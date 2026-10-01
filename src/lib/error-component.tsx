import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "Algo inesperado aconteceu. Recarregue a página.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-center text-ink">
      <div className="grid max-w-md justify-items-center gap-3">
        <span className="text-coral" aria-hidden="true">
          <TriangleAlert className="size-10" strokeWidth={2} />
        </span>
        <h1 className="font-display text-xl font-semibold">A partida parou</h1>
        <p className="text-sm break-words text-muted">{errorMessage(error)}</p>
      </div>
    </main>
  );
}
