"use client"

import * as React from "react"
import { QRCodeSVG } from "qrcode.react"
import { Download, Printer } from "lucide-react"
import { cn } from "@/lib/utils"

interface QRCodeDisplayProps {
  qrCode: string
  memberName: string
  className?: string
}

function QRCodeDisplay({ qrCode, memberName, className }: QRCodeDisplayProps) {
  const qrRef = React.useRef<HTMLDivElement>(null)

  function downloadQR() {
    const svg = qrRef.current?.querySelector("svg")
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    const size = 512
    canvas.width = size
    canvas.height = size + 40

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const img = new Image()
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size)
      ctx.fillStyle = "#1a1a1a"
      ctx.font = "bold 18px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(memberName, size / 2, size + 28)

      const link = document.createElement("a")
      link.download = `qr-${memberName.toLowerCase().replace(/\s+/g, "-")}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  function printQR() {
    const svg = qrRef.current?.querySelector("svg")
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR - ${memberName}</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: system-ui, sans-serif; }
            svg { width: 300px; height: 300px; }
            h2 { margin-top: 16px; font-size: 20px; color: #1a1a1a; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          ${svgData}
          <h2>${memberName}</h2>
          <script>window.print(); window.close();<\/script>
        </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className={cn("flex flex-col items-center gap-4 p-6 rounded-xl border border-[var(--border-base)] bg-[var(--bg-card)]", className)}>
      <div ref={qrRef} className="p-4 bg-white rounded-xl shadow-sm">
        <QRCodeSVG
          value={qrCode}
          size={200}
          level="H"
          marginSize={1}
        />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-[var(--text-base)]">{memberName}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{qrCode}</p>
      </div>
      <div className="flex gap-2 w-full">
        <button
          type="button"
          onClick={downloadQR}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] text-sm font-medium text-[var(--text-base)] hover:bg-[var(--color-primary-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
        >
          <Download className="size-4" />
          Descargar QR
        </button>
        <button
          type="button"
          onClick={printQR}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border border-[var(--border-base)] bg-[var(--bg-muted)] text-sm font-medium text-[var(--text-base)] hover:bg-[var(--color-primary-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
        >
          <Printer className="size-4" />
          Imprimir
        </button>
      </div>
    </div>
  )
}

export { QRCodeDisplay }
