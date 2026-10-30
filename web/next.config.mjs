const dev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const config = {
  // `npm run build` exports plain files that the Python server serves from ../static.
  output: dev ? undefined : "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // `npm run dev` forwards /api to the Python server on :8000.
  ...(dev && { rewrites: async () => [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }] }),
};

export default config;
