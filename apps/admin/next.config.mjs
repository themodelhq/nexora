/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  transpilePackages: ['@nexora/ui', '@nexora/config', '@nexora/types', '@nexora/blockchain'],
  webpack: (config) => {
    const stub = new URL('./lib/x402-stub.js', import.meta.url).pathname;
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@x402/evm': stub,
      '@x402/svm/exact/client': stub,
      '@x402/svm': stub,
      '@coinbase/cdp-sdk': stub,
      '@base-org/account': stub,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
