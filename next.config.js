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
};

module.exports = nextConfig;
