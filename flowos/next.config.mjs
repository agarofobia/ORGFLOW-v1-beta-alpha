/** @type {import("next").NextConfig} */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // No bloquear deploys por ESLint (hay warnings/escapes pendientes de limpiar).
  // ESLint sigue corriendo en dev/CI manual; sólo se ignora durante `next build`.
  eslint: { ignoreDuringBuilds: true },
  // TypeScript ya valida con `tsc --noEmit` antes del commit.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
