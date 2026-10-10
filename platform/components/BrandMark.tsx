/** Isotipo LSMFit (copia de frontend/components/common/BrandMark.tsx, que lo genera docs/brand/lsmfit.py). */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="-0.8 -0.8 57.6 37.6" width={size} height={Math.round((size * 37.6) / 57.6)} aria-hidden="true" className="shrink-0 text-[#D8421A]">
      <path d="M18.0 0A18.0 18.0 0 0 0 18.0 36.0L21.525 36.0L26.075 29.0L18.0 29.0A11.0 11.0 0 0 1 18.0 7.0L25.525 7.0L30.075 0ZM38.0 36.0A18.0 18.0 0 0 0 38.0 0L34.475 0L29.925 7.0L38.0 7.0A11.0 11.0 0 0 1 38.0 29.0L30.475 29.0L25.925 36.0Z" fill="currentColor" stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round" />
      <circle cx="28" cy="18" r="7.3" fill="currentColor" />
    </svg>
  );
}
