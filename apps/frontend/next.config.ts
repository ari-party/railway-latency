import bundleAnalyzer from '@next/bundle-analyzer';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  output: process.env.NEXT_OUTPUT as NextConfig['output'],

  devIndicators: false,
  poweredByHeader: false,

  experimental: {
    optimizePackageImports: ['@chakra-ui/react'],
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer(nextConfig);
