/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kwasu-ams/types', '@kwasu-ams/utils'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'kwasu-ams-excuses.s3.eu-west-1.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'kwasu-ams-reports.s3.eu-west-1.amazonaws.com',
      },
    ],
  },
};

export default nextConfig;
