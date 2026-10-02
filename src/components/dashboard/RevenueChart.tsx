"use client"

import { useState, useMemo, memo } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts'
import { CalendarDays } from 'lucide-react'

type DataPoint = {
  payment_date: string
  total_revenue: number
}

// The subset of recharts' tooltip props this tooltip renders. Recharts injects
// all of these at render time via `<Tooltip content={...} />`, so they are
// optional here — that is what lets `<CustomTooltip />` be constructed as an
// element with no props, exactly as before.
type RevenueTooltipProps = Partial<
  Pick<TooltipContentProps<number, string>, 'active' | 'payload' | 'label'>
>

interface RevenueChartProps {
  data7: DataPoint[]
  data30: DataPoint[]
}

// Format date for X-Axis (e.g., "Jul 5")
const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Format currency for Y-Axis and Tooltip
const formatCurrency = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
  return `₹${value}`
}

// Extracted outside the parent component so its reference is stable —
// prevents Recharts from re-mounting the tooltip on every parent re-render.
const CustomTooltip = memo(({ active, payload, label }: RevenueTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border border-slate-200 shadow-lg rounded-xl">
        <p className="text-sm text-slate-500 font-medium mb-1">{formatDate(String(label))}</p>
        <p className="text-xl font-bold text-emerald-600">
          ₹{Number(payload[0].value).toFixed(2)}
        </p>
      </div>
    )
  }
  return null
})
CustomTooltip.displayName = 'CustomTooltip'

export function RevenueChart({ data7, data30 }: RevenueChartProps) {
  const [view, setView] = useState<'7' | '30'>('7')
  
  const data = useMemo(() => view === '7' ? data7 : data30, [view, data7, data30])

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm col-span-1 lg:col-span-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Revenue Trend</h2>
          <p className="text-sm text-slate-500">Daily collections over time.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setView('7')}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === '7' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            7 Days
          </button>
          <button
            onClick={() => setView('30')}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === '30' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            30 Days
          </button>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="payment_date" 
              tickFormatter={formatDate} 
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis 
              tickFormatter={formatCurrency}
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="total_revenue"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorRevenue)"
              activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
