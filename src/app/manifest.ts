import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Painel de Eventos — Almeria",
    short_name: "Eventos",
    description: "Inteligência comercial de eventos (Almeria, Izzi Wine Garden)",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0c10",
    theme_color: "#0a0c10",
    icons: [
      { src: "/almeria-logo.png", sizes: "any", type: "image/png", purpose: "any" },
    ],
  };
}
