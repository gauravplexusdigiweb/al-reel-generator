/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @arg/shared ships pre-compiled CommonJS (dist/) with type declarations, so it
  // does NOT need transpiling. Listing it here made Next apply its Fast-Refresh
  // loader to the CJS file, injecting `import.meta` and breaking `next dev` on any
  // page that imports a runtime value (e.g. ASPECT_RATIOS) from it.
};

export default nextConfig;
