export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "radial-gradient(ellipse at center, #FFF7ED 0%, #F8FAFC 65%)",
      }}
    >
      <div className="w-full max-w-md px-4">{children}</div>
    </div>
  );
}
