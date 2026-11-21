"use client";

// Si algo falla al pintar una pantalla, Next la quita entera: sin esto quedaba en blanco (con una
// línea en inglés) y había que cerrar la app. Aquí se dice qué ha pasado, se enseña el detalle
// técnico (para poder avisar del fallo) y se vuelve a abrir con un toque. Las canciones no se
// pierden: están guardadas en el aparato.

import { useEffect } from "react";

export default function ErrorDePantalla({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      role="alert"
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "24px 22px",
        background: "#120a06",
        color: "#f3e8d6",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}>La app se ha parado</h1>
      <p style={{ margin: 0, maxWidth: 440, fontSize: 16, lineHeight: 1.45, color: "#d8c4a6" }}>
        Ha fallado algo al pintar la pantalla. Tus canciones siguen guardadas en el aparato.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          minHeight: 48,
          padding: "0 26px",
          borderRadius: 999,
          border: 0,
          background: "#ffd27a",
          color: "#1b0f08",
          font: "inherit",
          fontSize: 17,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Volver a abrir
      </button>
      <p style={{ margin: "6px 0 0", maxWidth: 520, fontSize: 13, lineHeight: 1.4, color: "#a8937a", overflowWrap: "anywhere" }}>
        Detalle del fallo: {error.message || "sin mensaje"}
      </p>
    </main>
  );
}
