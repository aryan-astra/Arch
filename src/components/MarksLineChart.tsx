import { CartesianGrid, LabelList, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

interface MarksLineChartPoint {
  test: string
  pct: number
  scored: number
  max: number
}

interface MarksLineChartProps {
  tests: MarksLineChartPoint[]
  passLine?: number
}

export default function MarksLineChart({ tests, passLine = 50 }: MarksLineChartProps) {
  const data = tests.map((entry, index) => ({
    label: entry.test || `Test ${index + 1}`,
    score: Math.max(0, Math.min(100, Number(entry.pct.toFixed(1)))),
    scored: Number(entry.scored.toFixed(1)),
    max: Number(entry.max.toFixed(1)),
    passLine,
  }))

  return (
    <div className="marks-line-chart-shell">
      <ResponsiveContainer width="100%" height={176}>
        <LineChart
          accessibilityLayer
          data={data}
          margin={{
            top: 22,
            left: 10,
            right: 10,
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <ReferenceArea
            y1={passLine}
            y2={100}
            fill="var(--chart-safe-zone, var(--chart-2))"
            fillOpacity={0.14}
            ifOverflow="extendDomain"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 11, fill: "var(--ink-4)" }}
            tickFormatter={(value) => String(value)}
          />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            cursor={false}
            contentStyle={{
              background: "var(--white)",
              border: "1px solid var(--ink-8)",
              borderRadius: 12,
              color: "var(--ink-1)",
              fontSize: 12,
            }}
            formatter={(value, key, item) => {
              const numeric = Number(value)
              if (key === "passLine") return [`${numeric.toFixed(0)}%`, "Pass line"]
              const payload = item?.payload as { scored: number; max: number } | undefined
              if (payload) return [`${payload.scored.toFixed(1)}/${payload.max.toFixed(1)} (${numeric.toFixed(1)}%)`, "Score"]
              return [`${numeric.toFixed(1)}%`, "Score"]
            }}
          />
          <ReferenceLine
            y={passLine}
            stroke="var(--chart-pass-line, var(--chart-2))"
            strokeDasharray="6 4"
            strokeWidth={1.8}
          />
          <Line
            dataKey="passLine"
            type="monotone"
            stroke="var(--chart-pass-line, var(--chart-2))"
            strokeWidth={1.2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={false}
          />
          <Line
            dataKey="score"
            type="natural"
            stroke="var(--chart-1)"
            strokeWidth={2.6}
            dot={{
              fill: "var(--chart-1)",
              r: 3.5,
            }}
            activeDot={{
              r: 6,
              fill: "var(--chart-1)",
            }}
          >
            <LabelList
              dataKey="score"
              position="top"
              offset={10}
              className="marks-line-chart-label"
              fontSize={11}
              formatter={(value) => `${Math.round(Number(value ?? 0))}`}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
