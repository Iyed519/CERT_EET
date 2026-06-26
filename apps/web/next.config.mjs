/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sortie autonome pour une image Docker légère (utilisée en INF03).
  output: 'standalone',
};

export default nextConfig;
