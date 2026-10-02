"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface OutstandingSummaryProps {
  bucket15: number
  bucket30: number
  bucket60: number
  bucket60Plus: number
  total: number
}

type AgingBucket = {
  name: string
  value: number
  color: string
}

// Recharts supplies these at render time via `<Tooltip content={...} />`, hence
// optional. `payload[0].payload` is the `AgingBucket` slice rendered by <Pie />.
type AgingTooltipProps = Partial<
  Pick<TooltipContentProps<number, string>, 'active' | 'payload'>
>

// Declared outside the parent component so its reference is stable —
// prevents Recharts from remounting the tooltip on every parent re-render.
function CustomTooltip({ active, payload }: AgingTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as AgingBucket
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-xl">
        <p className="text-sm font-bold" style={{ color: data.color }}>{data.name}</p>
        <p className="text-sm font-medium text-slate-700 mt-1">₹{data.value.toFixed(2)}</p>
      </div>
    )
  }
  return null
}

export function OutstandingSummary({ bucket15, bucket30, bucket60, bucket60Plus, total }: OutstandingSummaryProps) {
  const data = [
    { name: '0-15 Days', value: bucket15, color: '#94a3b8' }, // Slate
    { name: '16-30 Days', value: bucket30, color: '#f59e0b' }, // Amber
    { name: '31-60 Days', value: bucket60, color: '#ea580c' }, // Orange
    { name: '60+ Days', value: bucket60Plus, color: '#dc2626' }, // Red
  ].filter(item => item.value > 0) // Only show buckets that have debt

  const formatCurrency = (value: number) => {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
    return `₹${value.toFixed(0)}`
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">Aging Summary</h2>
        <p className="text-sm text-slate-500">Market debt risk breakdown.</p>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-sm">No outstanding debt!</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="h-[200px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs font-medium text-slate-500">Total Risk</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {data.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 truncate">{item.name}</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{formatCurrency(item.value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-100">
        <Link 
          href="/outstanding"
          className="text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors w-full flex justify-center"
        >
          View Collection Details &rarr;
        </Link>
      </div>
    </div>
  )
}
