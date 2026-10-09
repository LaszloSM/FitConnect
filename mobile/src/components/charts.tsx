/**
 * Gráficas de la app. Reglas (skill dataviz + DESIGN.md):
 * - Una sola serie por gráfica, en coral; la pista es el tono apagado.
 *   Nada de categorías de color: cada barra lleva su etiqueta en texto.
 * - El texto nunca va del color del dato: valores y etiquetas en tinta.
 * - Barras de 4 px de radio en el extremo, línea de 2 px, punto final de 8 px
 *   con anillo del color de la superficie.
 * - Toda gráfica tiene su lectura en texto (accessibilityLabel) y la cifra
 *   escrita al lado: el color nunca es el único canal.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { fonts, space, useColors } from "@/lib/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/**
 * Anillo de calorías: lo consumido sobre la meta. Pasado el 100 % el arco se
 * completa y cambia a ámbar; la cifra de adentro dice cuánto queda o cuánto
 * sobra, que es lo que la persona quiere saber.
 */
export function CalorieRing({ value, target, size = 148 }: { value: number; target?: number; size?: number }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = target ? Math.min(value / target, 1) : 0;
  const over = Boolean(target && value > target * 1.05);
  const progress = useRef(new Animated.Value(ratio)).current;

  useEffect(() => {
    if (reduce) {
      progress.setValue(ratio);
      return;
    }
    // Se anima porque el dato cambió de verdad (se registró una comida), no al navegar.
    Animated.timing(progress, { toValue: ratio, duration: 520, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: false }).start();
  }, [ratio, reduce, progress]);

  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });
  const left = target ? Math.round(target - value) : null;
  const label = target
    ? left! >= 0
      ? `${Math.round(value)} de ${target} kilocalorías; quedan ${left}`
      : `${Math.round(value)} de ${target} kilocalorías; te pasaste por ${-left!}`
    : `${Math.round(value)} kilocalorías`;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.muted} strokeWidth={stroke} fill="none" />
        {target ? (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? c.warn : c.brand}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: c.ink }}>
          {left === null ? Math.round(value) : Math.abs(left)}
        </Text>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12.5, color: c.inkMuted }}>
          {left === null ? "kcal hoy" : left >= 0 ? "kcal quedan" : "kcal de más"}
        </Text>
      </View>
    </View>
  );
}

/** Medidor horizontal: valor contra meta con la cifra escrita. */
export function Meter({
  label,
  value,
  target,
  unit,
  kind = "min",
}: {
  label: string;
  value: number;
  target?: number;
  unit: string;
  /** min: hay que llegar (proteína, fibra); max: no pasarse (sodio, azúcares). */
  kind?: "min" | "max";
}) {
  const c = useColors();
  const pct = target ? Math.min(value / target, 1) : 0;
  const over = Boolean(target && kind === "max" && value > target);
  const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("es-CO") : String(Math.round(n * 10) / 10).replace(".", ","));
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${fmt(value)} ${unit}${target ? ` de ${fmt(target)}` : ""}${over ? ", por encima del límite" : ""}`}
      style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13.5, color: c.inkMuted }}>{label}</Text>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: c.ink, fontVariant: ["tabular-nums"] }}>
          {fmt(value)}
          <Text style={{ fontFamily: fonts.body, color: c.inkMuted }}>{target ? ` / ${fmt(target)}` : ""} {unit}</Text>
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: "hidden" }}>
        <View style={{ height: 8, width: `${pct * 100}%`, borderRadius: 4, backgroundColor: over ? c.warn : c.brand }} />
      </View>
    </View>
  );
}

const WEEKDAY_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Siete días de calorías contra la meta. La barra de hoy va en coral y las
 * demás en el tono de apoyo; la meta es una regla de 1 px con su etiqueta.
 * Tocar una barra la selecciona y muestra su cifra (el «hover» del celular).
 */
export function WeekBars({ days, target, height = 132 }: { days: { day: string; kcal: number; logged: boolean }[]; target?: number; height?: number }) {
  const c = useColors();
  const [selected, setSelected] = useState(days.length - 1);
  const [width, setWidth] = useState(0);
  const max = Math.max(target ?? 0, ...days.map((d) => d.kcal), 1) * 1.1;
  const plotH = height - 22;
  const slot = width / Math.max(days.length, 1);
  const barW = Math.min(24, slot * 0.56);
  const y = (v: number) => plotH - (v / max) * plotH;
  const sel = days[selected];

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: space.sm }}>
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: c.inkMuted }}>
          {sel ? (sel.logged ? labelForDay(sel.day) : `${labelForDay(sel.day)} · sin registro`) : ""}
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: c.ink, fontVariant: ["tabular-nums"] }}>
          {sel?.logged ? `${Math.round(sel.kcal).toLocaleString("es-CO")} kcal` : "—"}
        </Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={plotH} y2={plotH} stroke={c.line} strokeWidth={1} />
            {target ? <Line x1={0} x2={width} y1={y(target)} y2={y(target)} stroke={c.inkMuted} strokeWidth={1} opacity={0.6} /> : null}
            {days.map((d, i) => {
              const h = Math.max(d.logged ? (d.kcal / max) * plotH : 0, d.logged ? 3 : 0);
              const x = i * slot + (slot - barW) / 2;
              const isLast = i === days.length - 1;
              const fill = i === selected ? c.brand : isLast ? c.brand : c.inkMuted;
              return d.logged ? (
                <Path key={d.day} d={roundedTop(x, plotH - h, barW, h, 4)} fill={fill} opacity={i === selected || isLast ? 1 : 0.38} />
              ) : (
                <Rect key={d.day} x={x} y={plotH - 2} width={barW} height={2} fill={c.line} />
              );
            })}
          </Svg>
        ) : null}
        {target && width > 0 ? (
          <Text style={{ position: "absolute", right: 0, top: Math.max(y(target) - 17, 0), fontFamily: fonts.bodyMedium, fontSize: 11.5, color: c.inkMuted }}>
            Meta {target.toLocaleString("es-CO")}
          </Text>
        ) : null}
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row" }}>
          {days.map((d, i) => (
            <Pressable
              key={d.day}
              accessibilityRole="button"
              accessibilityLabel={`${labelForDay(d.day)}: ${d.logged ? `${Math.round(d.kcal)} kilocalorías` : "sin registro"}`}
              accessibilityState={{ selected: i === selected }}
              onPress={() => setSelected(i)}
              style={{ flex: 1, justifyContent: "flex-end", alignItems: "center" }}>
              <Text style={{ fontFamily: i === selected ? fonts.bodySemi : fonts.body, fontSize: 12, color: i === selected ? c.ink : c.inkMuted }}>
                {WEEKDAY_SHORT[(dayIndex(d.day) + 6) % 7]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Peso por día y su tendencia (media móvil de 7 registros). */
export function WeightLine({ points, height = 140 }: { points: { day: string; weight_kg: number }[]; height?: number }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const trend = useMemo(
    () => points.map((_, i) => {
      const win = points.slice(Math.max(0, i - 6), i + 1);
      return win.reduce((s, p) => s + p.weight_kg, 0) / win.length;
    }),
    [points],
  );
  if (points.length < 2) return null;
  const values = points.map((p) => p.weight_kg);
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const pad = 6;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2 - 34);
  const y = (v: number) => pad + ((hi - v) / (hi - lo)) * (height - pad * 2 - 18);
  const path = trend.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = trend[0];
  const last = trend[trend.length - 1];
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <View
      accessible
      accessibilityLabel={`Peso: ${points[points.length - 1].weight_kg} kilos el último registro; la tendencia ${delta < 0 ? "bajó" : delta > 0 ? "subió" : "se mantuvo"} ${Math.abs(delta)} kilos.`}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[hi, lo].map((v) => (
              <Line key={v} x1={0} x2={width - 34} y1={y(v)} y2={y(v)} stroke={c.line} strokeWidth={1} />
            ))}
            {points.map((p, i) => (
              <Circle key={p.day} cx={x(i)} cy={y(p.weight_kg)} r={2.5} fill={c.inkMuted} opacity={0.45} />
            ))}
            <Path d={path} stroke={c.brand} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(points.length - 1)} cy={y(last)} r={5} fill={c.brand} stroke={c.card} strokeWidth={2} />
          </Svg>
        ) : null}
        {width > 0 ? (
          <>
            <Text style={{ position: "absolute", right: 0, top: y(hi) - 8, fontFamily: fonts.body, fontSize: 11.5, color: c.inkMuted }}>{hi} kg</Text>
            <Text style={{ position: "absolute", right: 0, top: y(lo) - 8, fontFamily: fonts.body, fontSize: 11.5, color: c.inkMuted }}>{lo} kg</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function dayIndex(iso: string) {
  const [yy, m, d] = iso.split("-").map(Number);
  return new Date(yy, m - 1, d).getDay();
}

const DAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function labelForDay(iso: string) {
  const [yy, m, d] = iso.split("-").map(Number);
  return `${DAYS_LONG[new Date(yy, m - 1, d).getDay()]} ${d}`;
}
