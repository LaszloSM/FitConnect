"use client"

import { Alert } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

export const PARQ_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const;

const QUESTIONS: { key: string; text: string }[] = [
  { key: "q1", text: "¿Algún médico le ha dicho que tiene una condición cardíaca y que solo debe hacer actividad física recomendada por un médico?" },
  { key: "q2", text: "¿Siente dolor en el pecho cuando hace actividad física?" },
  { key: "q3", text: "¿En el último mes, ha tenido dolor en el pecho cuando no estaba haciendo actividad física?" },
  { key: "q4", text: "¿Pierde el equilibrio debido a mareos o alguna vez pierde el conocimiento?" },
  { key: "q5", text: "¿Tiene algún problema en los huesos o articulaciones que podría empeorar por un cambio en su actividad física?" },
  { key: "q6", text: "¿Actualmente su médico le prescribe medicamentos para la presión arterial o para el corazón?" },
  { key: "q7", text: "¿Conoce alguna otra razón por la que no debería hacer actividad física?" },
]

interface PARQFormProps {
  value?: Record<string, boolean>
  onChange: (answers: Record<string, boolean>) => void
}

function PARQForm({ value = {}, onChange }: PARQFormProps) {
  const hasPositive = Object.values(value).some(Boolean)

  function setAnswer(key: string, answer: boolean) {
    onChange({ ...value, [key]: answer })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--text-base)]">Cuestionario PAR-Q</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Por favor responda con honestidad. Este cuestionario ayuda a determinar si es seguro que comience un programa de ejercicios.
        </p>
      </div>

      <div className="space-y-3">
        {QUESTIONS.map((q, idx) => {
          const answer = value[q.key]
          return (
            <div
              key={q.key}
              className="flex flex-col gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] p-4"
            >
              <p className="text-sm text-[var(--text-base)] leading-relaxed">
                <span className="font-semibold text-[var(--text-muted)] mr-1">{idx + 1}.</span>
                {q.text}
              </p>
              <div className="flex items-center gap-3">
                {([true, false] as const).map((opt) => {
                  const selected = answer === opt
                  const label = opt ? "Sí" : "No"
                  return (
                    <label
                      key={String(opt)}
                      className={cn(
                        "flex items-center gap-2 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium border transition-colors select-none",
                        selected
                          ? opt
                            ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400"
                            : "bg-green-500/10 border-green-500/40 text-green-600 dark:text-green-400"
                          : "border-[var(--border-base)] text-[var(--text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--text-base)]"
                      )}
                    >
                      <input
                        type="radio"
                        name={q.key}
                        value={String(opt)}
                        checked={selected}
                        onChange={() => setAnswer(q.key, opt)}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          "size-3 rounded-full border-2 flex items-center justify-center shrink-0",
                          selected
                            ? opt ? "border-amber-500 bg-amber-500" : "border-green-500 bg-green-500"
                            : "border-[var(--border-base)]"
                        )}
                      >
                        {selected && <span className="size-1.5 rounded-full bg-white" />}
                      </span>
                      {label}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {hasPositive && (
        <Alert variant="warning" title="Consulte a su médico">
          Una o más de sus respuestas indica que debe consultar a un médico antes de iniciar el programa de ejercicios.
        </Alert>
      )}
    </div>
  )
}

export { PARQForm }
