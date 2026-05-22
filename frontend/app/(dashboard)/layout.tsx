import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-deep">
      <Sidebar />
      <Header />
      <main className="ml-64 pt-16 p-6">{children}</main>
    </div>
  );
}

