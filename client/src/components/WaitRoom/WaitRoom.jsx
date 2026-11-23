import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Only same-origin paths are allowed to prevent open redirect vulnerabilities.
function safeReturnTo(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export default function WaitRoom() {
  const [searchParams] = useSearchParams();
  const name = searchParams.get("name");
  const redirectIn = parseInt(searchParams.get("redirectIn"));
  const finished = searchParams.get("reason") === "finalizado";
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  useEffect(() => {
    // A finished shift must not bounce the student back into the experience.
    if (finished) return;
    const timer = setTimeout(() => window.location.assign(returnTo), redirectIn);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
        {!finished && (
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-blue-400 animate-spin" />
          </div>
        )}

        {finished ? (
          <p className="text-slate-300 text-base leading-relaxed">
            Su turno para <span className="text-blue-400 font-medium">{name}</span> finalizó. ¡Gracias por participar!
          </p>
        ) : (
          <>
            <p className="text-slate-300 text-base leading-relaxed">
              Su turno para <span className="text-blue-400 font-medium">{name}</span> todavía no está abierto.
            </p>

            <p className="text-slate-400 text-sm mt-3">Espere y será redirigido automáticamente.</p>

            <div className="mt-8 flex justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
