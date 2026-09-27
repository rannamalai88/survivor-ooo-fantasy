/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.fantasysurvivorgame.com',
        pathname: '/images/**',
      },
    ],
  },
  // Pages renamed in the S51 redesign — server-side redirects for old links/bookmarks
  async redirects() {
    return [
      { source: '/reveals', destination: '/matchups', permanent: false },
      { source: '/my-team', destination: '/managers/me', permanent: false },
      { source: '/scoreboard', destination: '/survivors', permanent: false },
    ];
  },
};

module.exports = nextConfig;
