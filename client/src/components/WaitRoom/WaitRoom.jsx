import React, { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

export default function WaitRoom() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const name = searchParams.get("name");
  const redirectIn = parseInt(searchParams.get("redirectIn"));

  const redirect = () => {
    navigate("/");
  };

  useEffect(() => {
    setTimeout(redirect, redirectIn);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
        {/* Spinner */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-blue-400 animate-spin" />
        </div>

        <h1 className="text-white text-2xl font-semibold mb-3">Sala de espera</h1>

        <p className="text-slate-300 text-base leading-relaxed">
          Su turno para
          <span className="text-blue-400 font-medium">'{name}'</span>
          todavía no está abierto.
        </p>

        <p className="text-slate-400 text-sm mt-3">Espere y será redirigido automáticamente.</p>

        <div className="mt-8 flex justify-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
