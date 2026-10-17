/** @type {import('next').NextConfig} */
const nextConfig = {
  // libSQL ships native bindings for local file databases; keep it out of the bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
