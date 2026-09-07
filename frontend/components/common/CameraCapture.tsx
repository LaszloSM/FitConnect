"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, RefreshCw, Check, X, SwitchCamera } from "lucide-react";

const SIZE = 512;

/** Captura una foto con la cámara del equipo (webcam o celular), la recorta
 * al cuadrado y la entrega como File webp listo para subir. */
export function CameraCapture({ onCapture, trigger }: { onCapture: (file: File) => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const startSeq = useRef(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite usar la cámara. Sube la foto como archivo.");
      return;
    }
    const token = ++startSeq.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1024 }, height: { ideal: 1024 } }, audio: false });
      if (token !== startSeq.current) {
        // El diálogo se cerró o cambió de cámara mientras el permiso estaba pendiente
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setError("No se pudo abrir la cámara. Revisa el permiso del navegador o sube la foto como archivo.");
    }
  }, [facing, stop]);

  useEffect(() => {
    if (open && !preview) void start();
    if (!open) {
      startSeq.current++;
      stop();
      setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; });
      blobRef.current = null;
    }
    return () => { startSeq.current++; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // La vista previa va en espejo (natural para quien se mira); la foto guardada
    // no, para que el staff vea a la persona tal como es en el check-in
    ctx.drawImage(video, sx, sy, side, side, 0, 0, SIZE, SIZE);
    canvas.toBlob((blob) => {
      if (!blob) return;
      blobRef.current = blob;
      setPreview(URL.createObjectURL(blob));
      stop();
    }, "image/webp", 0.88);
  };

  const confirm = () => {
    if (!blobRef.current) return;
    onCapture(new File([blobRef.current], `foto-${Date.now()}.webp`, { type: "image/webp" }));
    setOpen(false);
  };

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger ?? (
          <Button type="button" variant="outline" className="h-9 text-xs">
            <Camera className="h-3.5 w-3.5 mr-1.5" /> Tomar foto
          </Button>
        )}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Foto del socio</DialogTitle>
            <DialogDescription>Centra el rostro y toma la foto. Se guarda de forma privada; solo el staff del gym la ve.</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Vista previa" className="h-full w-full object-cover" />
            ) : (
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
            )}
            {!preview && !error && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[70%] w-[70%] rounded-full border-2 border-white/60" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/90 bg-black/70">{error}</div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            {preview ? (
              <>
                <Button type="button" variant="outline" onClick={() => { setPreview((p) => { if (p) URL.revokeObjectURL(p); return null; }); blobRef.current = null; void start(); }}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Repetir
                </Button>
                <Button type="button" onClick={confirm} className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]">
                  <Check className="h-4 w-4 mr-1.5" /> Usar esta foto
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} title="Cambiar cámara">
                  <SwitchCamera className="h-4 w-4" />
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
                  <Button type="button" onClick={shoot} disabled={!!error} className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]">
                    <Camera className="h-4 w-4 mr-1.5" /> Capturar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
