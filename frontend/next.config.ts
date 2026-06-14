import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Presentation slide images (SlideViewer.tsx) are fetched server-side
    // from Unsplash by the Flask backend; the frontend only renders the
    // resulting CDN URLs via next/image.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
