/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Coinbase Smart Wallet's connector (pulled in by wagmi's default connector
  // set) drags in @coinbase/cdp-sdk's optional x402/Solana payment code paths,
  // which reference packages we don't install. Keep them external so the
  // bundler doesn't try to statically resolve dynamic imports we never hit.
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],
};

export default nextConfig;
