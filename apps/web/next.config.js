/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kwasu-ams/types', '@kwasu-ams/utils'],
  images: {
    domains: [
      'kwasu-ams-excuses.s3.eu-west-1.amazonaws.com',
      'kwasu-ams-reports.s3.eu-west-1.amazonaws.com',
    ],
  },
};

export default nextConfig;
