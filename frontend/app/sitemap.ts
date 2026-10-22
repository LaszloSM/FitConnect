import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/register", priority: 0.8 },
  { path: "/login", priority: 0.3 },
  { path: "/terminos", priority: 0.2 },
  { path: "/privacidad", priority: 0.2 },
  { path: "/tratamiento-datos", priority: 0.2 },
  { path: "/app", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, priority }) => ({ url: `${SITE_URL}${path}`, priority }));
}
