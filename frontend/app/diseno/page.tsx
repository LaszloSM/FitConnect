import { notFound } from "next/navigation";
import { DisenoGallery } from "./DisenoGallery";

export const metadata = { title: "Sistema Calor" };

export default function DisenoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DisenoGallery />;
}
