/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi/rainbowkit optional deps that are not used in the browser build
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    return config;
  },
};
export default nextConfig;
