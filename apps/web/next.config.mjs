/** @type {import('next').NextConfig} */

// US-AUTH-13 — Politique de sécurité du contenu du frontend.
// - scripts : Next.js (App Router) injecte des scripts en ligne pour hydrater
//   la page ; sans nonce par requête (qui rendrait toutes les pages
//   dynamiques), 'unsafe-inline' reste nécessaire. 'unsafe-eval' en
//   développement seulement (rechargement à chaud).
// - images : data: (QR code MFA, visuels), blob: (aperçus) ; médias : blob:.
// - cadres : uniquement les lecteurs vidéo sans pistage (US-FORM-05).
// - aucune page ne peut être affichée dans un cadre (frame-ancestors 'none').
const developpement = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${developpement ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob: https://www.youtube-nocookie.com https://player.vimeo.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const enTetesSecurite = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Caméra : seulement la plateforme elle-même (surveillance webcam, US-QCM-12).
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
];

const nextConfig = {
  reactStrictMode: true,
  // Sortie autonome pour une image Docker légère (utilisée en INF03).
  output: 'standalone',
  // US-AUTH-13 : l'en-tête « X-Powered-By: Next.js » ne renseigne que l'attaquant.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: enTetesSecurite }];
  },
};

export default nextConfig;
