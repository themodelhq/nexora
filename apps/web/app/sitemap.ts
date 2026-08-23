import type { MetadataRoute } from 'next';

const base = 'https://nexora.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '/', '/token', '/tokenomics', '/airdrop', '/staking', '/vesting',
    '/governance', '/roadmap', '/transparency', '/dashboard',
  ];
  return routes.map((r) => ({
    url: `${base}${r}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: r === '/' ? 1 : 0.8,
  }));
}
