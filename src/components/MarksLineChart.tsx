import { CartesianGrid, Area, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

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
      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          accessibilityLayer
          data={data}
          margin={{
            top: 28,
            left: 12,
            right: 12,
            bottom: 4,
          }}
        >
          {/* Subtle gradient definitions for glow effect */}
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="subtleGlow">
              <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Soft grid */}
          <CartesianGrid 
            vertical={false} 
            stroke="var(--chart-grid)" 
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />

          {/* Safe zone reference area with subtle gradient */}
          <ReferenceArea
            y1={passLine}
            y2={100}
            fill="var(--chart-2)"
            fillOpacity={0.08}
            ifOverflow="extendDomain"
          />

          {/* X-axis */}
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ 
              fontSize: 11, 
              fill: "var(--ink-4)",
              fontWeight: 500,
            }}
            tickFormatter={(value) => String(value)}
          />

          {/* Y-axis starting from 0 */}
          <YAxis hide domain={[0, 100]} />

          {/* Enhanced tooltip */}
          <Tooltip
            cursor={{ stroke: "var(--chart-1)", strokeWidth: 1, strokeDasharray: "4 4", strokeOpacity: 0.3 }}
            contentStyle={{
              background: "var(--white)",
              border: "1.5px solid var(--chart-1)",
              borderRadius: 14,
              color: "var(--ink-1)",
              fontSize: 12,
              padding: "10px 14px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              fontWeight: 500,
            }}
            formatter={(value, key, item) => {
              const numeric = Number(value)
              if (key === "passLine") return [`${numeric.toFixed(0)}%`, "Pass line"]
              const payload = item?.payload as { scored: number; max: number } | undefined
              if (payload) {
                return [
                  <span key="score-details" style={{ color: "var(--chart-1)", fontWeight: 600 }}>
                    {payload.scored.toFixed(1)}/{payload.max.toFixed(1)} ({numeric.toFixed(1)}%)
                  </span>,
                  "Score"
                ]
              }
              return [`${numeric.toFixed(1)}%`, "Score"]
            }}
            labelStyle={{
              color: "var(--ink-2)",
              fontWeight: 600,
              marginBottom: 4,
            }}
          />

          {/* Pass line reference with subtle styling */}
          <ReferenceLine
            y={passLine}
            stroke="var(--chart-2)"
            strokeDasharray="6 4"
            strokeWidth={1.6}
            strokeOpacity={0.6}
          />

          {/* Gradient area fill under the line */}
          <Area
            dataKey="score"
            type="monotone"
            stroke="none"
            fill="url(#scoreGradient)"
            fillOpacity={1}
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />

          {/* Main score line with glow effect */}
          <Line
            dataKey="score"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={3.2}
            dot={{
              fill: "var(--white)",
              stroke: "var(--chart-1)",
              strokeWidth: 2.5,
              r: 4.5,
              filter: "url(#subtleGlow)",
            }}
            activeDot={{
              r: 7,
              fill: "var(--chart-1)",
              stroke: "var(--white)",
              strokeWidth: 2.5,
              filter: "url(#glow)",
            }}
            isAnimationActive={true}
            animationDuration={1400}
            animationEasing="ease-in-out"
            filter="url(#subtleGlow)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
