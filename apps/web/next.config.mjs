/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  transpilePackages: ['@nexora/ui', '@nexora/config', '@nexora/types', '@nexora/blockchain'],
  webpack: (config) => {
    // The wagmi Coinbase Smart Wallet connector references optional @x402
    // subpath packages that we never import at runtime. Alias them to a stub
    // so webpack does not try to resolve the missing modules.
    const stub = new URL('./lib/x402-stub.js', import.meta.url).pathname;
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // The wagmi Coinbase Smart Wallet connector chain references optional
      // packages this app never imports at runtime. Stub them so the build
      // succeeds without shipping unused Coinbase SDK code.
      '@x402/evm': stub,
      '@x402/svm/exact/client': stub,
      '@x402/svm': stub,
      '@coinbase/cdp-sdk': stub,
      '@base-org/account': stub,
    };
    return config;
  },
  images: {
    domains: [],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
