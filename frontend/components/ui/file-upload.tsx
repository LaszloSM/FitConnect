"use client"

import * as React from "react"
import { Upload, X, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadProps {
  value?: string
  onChange: (file: File | null) => void
  shape?: "circle" | "rect"
  accept?: string
}

function FileUpload({ value, onChange, shape = "rect", accept = "image/jpeg,image/png,image/webp" }: FileUploadProps) {
  const [preview, setPreview] = React.useState<string | null>(value ?? null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setPreview(value ?? null)
  }, [value])

  function processFile(file: File) {
    setError(null)
    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten imágenes (JPG, PNG, WEBP)")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("El archivo no puede superar 2MB")
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    onChange(file)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation()
    setPreview(null)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const isCircle = shape === "circle"

  return (
    <div className="space-y-2">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative cursor-pointer border-2 border-dashed transition-colors",
          "hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]",
          dragging ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]" : "border-[var(--border-base)] bg-[var(--bg-muted)]",
          isCircle ? "rounded-full w-32 h-32 mx-auto" : "rounded-xl w-full h-36"
        )}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Preview"
              className={cn("w-full h-full object-cover", isCircle ? "rounded-full" : "rounded-xl")}
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-colors z-10"
              aria-label="Eliminar imagen"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--border-base)]">
              {isCircle ? <ImageIcon className="size-5 text-[var(--text-muted)]" /> : <Upload className="size-5 text-[var(--text-muted)]" />}
            </div>
            {!isCircle && (
              <p className="text-xs text-[var(--text-muted)] text-center">
                Arrastra tu imagen aquí o <span className="text-[var(--color-primary-ink)] font-medium">haz clic para seleccionar</span>
              </p>
            )}
            <p className="text-[10px] text-[var(--text-placeholder)]">JPG, PNG, WEBP · Máx 2MB</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export { FileUpload }
