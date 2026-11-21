import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.thetruevoice.xyz";

  return [
    {
      url: baseUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/discover.html`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
