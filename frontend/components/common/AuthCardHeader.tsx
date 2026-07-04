import Link from "next/link";
import { BrandMark } from "@/components/common/BrandMark";

export function AuthCardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="Volver al inicio">
          <BrandMark size={32} />
          <span className="text-slate-900 font-extrabold text-xl tracking-tight group-hover:text-lime-700 transition-colors">FitConnect</span>
        </Link>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
          ← Volver al inicio
        </Link>
      </div>
      <h2 className="text-slate-900 font-bold text-lg">{title}</h2>
      <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>
    </div>
  );
}
