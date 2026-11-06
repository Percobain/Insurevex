/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep verification builds separate from an already-running development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi/rainbowkit optional deps that are not used in the browser build
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    return config;
  },
};
export default nextConfig;
