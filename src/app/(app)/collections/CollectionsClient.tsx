"use client"

import { useState, useMemo, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { Plus, MapPin, Truck, CheckCircle2, Clock, ShieldCheck } from "lucide-react"
import { useAppStore } from "@/store"

type Restaurant = {
  id: string
  name: string
  address: string | null
  contact_person: string | null
  phone: string | null
}

type Collection = {
  id: string
  restaurant_id: string
  status: string
  total_amount: number
}

interface Props {
  initialRestaurants: Restaurant[]
  initialCollections: Collection[]
}

export default function CollectionsClient({ initialRestaurants, initialCollections }: Props) {
  const user = useAppStore((state) => state.user)
  const isManagerOrOwner = user?.role === 'manager' || user?.role === 'owner' || user?.role === 'accountant'

  const [collections, setCollections] = useState<Collection[]>(initialCollections)
  const [verifying, setVerifying] = useState<string | null>(null)

  const handleVerify = useCallback(async (collectionId: string) => {
    if (!window.confirm("Mark this collection as verified? It will be locked from further edits.")) return

    setVerifying(collectionId)
    const { error } = await supabase
      .from('collections')
      .update({ status: 'verified' })
      .eq('id', collectionId)

    if (error) {
      alert("Verification failed: " + error.message)
    } else {
      // Optimistic update — no need to refetch
      setCollections(prev =>
        prev.map(c => c.id === collectionId ? { ...c, status: 'verified' } : c)
      )
    }
    setVerifying(null)
  }, [])

  const mergedRoute = useMemo(() =>
    initialRestaurants.map(restaurant => {
      const todayCollection = collections.find(c => c.restaurant_id === restaurant.id)
      return {
        ...restaurant,
        collection_id: todayCollection?.id,
        status: todayCollection?.status || 'pending_visit',
        amount: todayCollection?.total_amount || 0
      }
    }),
    [initialRestaurants, collections]
  )

  const completedCount = mergedRoute.filter(r => r.status === 'completed' || r.status === 'verified').length
  const totalCount = mergedRoute.length
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  return (
    <>
      {/* Progress Bar */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
          <span>Route Progress</span>
          <span>{completedCount} of {totalCount} Visited ({progressPercent}%)</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stop List */}
      <div className="space-y-4">
        {mergedRoute.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
            <Truck className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p>No active restaurants found. Add restaurants to generate a route.</p>
          </div>
        ) : (
          mergedRoute.map((stop) => {
            const isCompleted = stop.status === 'completed'
            const isVerified = stop.status === 'verified'
            const isVerifyingThis = verifying === stop.collection_id
            
            return (
              <div
                key={stop.id}
                className={`bg-white rounded-xl border shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
                  isVerified ? 'border-green-300 bg-green-50/30' : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`text-lg font-bold ${(isCompleted || isVerified) ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                      {stop.name}
                    </h3>
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <CheckCircle2 className="h-3 w-3" /> Collected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        <Clock className="h-3 w-3" /> Pending Visit
                      </span>
                    )}
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-sm text-slate-500">
                    <MapPin className="size-4 text-slate-400" />
                    <span className="line-clamp-1">{stop.address || "No address on file"}</span>
                  </p>
                  <p className="mt-1 pl-5 text-sm text-slate-500">
                    {[stop.contact_person, stop.phone].filter(Boolean).join(" • ") || "No contact on file"}
                  </p>
                </div>
                
                <div className="w-full sm:w-auto mt-4 sm:mt-0 flex flex-col items-end gap-2">
                  {(isCompleted || isVerified) ? (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-slate-500">Amount</div>
                        <div className="text-xl font-bold text-slate-900">₹{stop.amount}</div>
                      </div>
                      
                      {isCompleted && isManagerOrOwner && stop.collection_id && (
                        <button
                          onClick={() => handleVerify(stop.collection_id!)}
                          disabled={isVerifyingThis}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {isVerifyingThis ? 'Verifying...' : 'Verify'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <Link
                      href={`/collections/new?restaurant_id=${stop.id}`}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold shadow-sm transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Record Collection
                    </Link>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
