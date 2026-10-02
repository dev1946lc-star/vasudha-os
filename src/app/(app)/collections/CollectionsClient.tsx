"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import { Plus, MapPin, Truck, CheckCircle2, Clock, ShieldCheck, AlertTriangle } from "lucide-react"
import { useAppStore } from "@/store"

type Restaurant = {
  id: string
  name: string
  address: string | null
  contact_person: string | null
  phone: string | null
}

/**
 * Credit position for a restaurant on the day's route.
 *
 * credit_limit was stored, displayed on the profile, and enforced nowhere, so a
 * distributor could deliver into unbounded debt and only find out on a statement.
 * `record_collection` now warns (migration 31) -- deliberately not blocking,
 * since a delivery that physically happened must still be recorded -- which means
 * the warning has to reach the person who can act on it: the agent, before the
 * next stop.
 */
type CreditStatus = {
  restaurant_id: string
  outstanding: number
  credit_limit: number
  headroom: number
  exceeded: boolean
  unlimited: boolean
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
  /** Per-restaurant credit position. Empty until the lookup resolves. */
  initialCredit: CreditStatus[]
}

export default function CollectionsClient({ initialRestaurants, initialCollections, initialCredit }: Props) {
  const user = useAppStore((state) => state.user)
  const isManagerOrOwner = user?.role === 'manager' || user?.role === 'owner' || user?.role === 'accountant'

  const [collections, setCollections] = useState<Collection[]>(initialCollections)
  const [verifying, setVerifying] = useState<string | null>(null)

  // Fetched client-side rather than passed in: restaurant_credit_exposure is one
  // row per restaurant, so a single RPC over the day's route beats N page-level
  // queries, and the route list is already client-rendered.
  const [credit, setCredit] = useState<CreditStatus[]>(initialCredit)

  useEffect(() => {
    let cancelled = false

    async function loadCredit() {
      const ids = initialRestaurants.map(r => r.id)
      if (ids.length === 0) return

      // restaurant_credit_exposure takes one id, so the day's stops are read in
      // parallel. Bounded by the route size (typically well under 200).
      const results = await Promise.all(
        ids.map(async (id): Promise<CreditStatus | null> => {
          try {
            const { data, error } = await supabase.rpc('restaurant_credit_exposure', {
              p_restaurant_id: id,
            })
            if (error || !data || data.length === 0) return null
            const row = data[0]
            return {
              restaurant_id: id,
              outstanding: Number(row.outstanding),
              credit_limit: Number(row.credit_limit),
              headroom: Number(row.headroom),
              exceeded: Boolean(row.exceeded),
              unlimited: Boolean(row.unlimited),
            }
          } catch {
            // One failing lookup must not blank the whole route; the badge for that
            // stop simply does not appear.
            return null
          }
        })
      )

      if (!cancelled) {
        setCredit(results.filter((r): r is CreditStatus => r !== null))
      }
    }

    loadCredit()

    return () => { cancelled = true }
  }, [initialRestaurants])

  const creditByRestaurant = useMemo(
    () => new Map(credit.map(c => [c.restaurant_id, c])),
    [credit]
  )

  // How many stops are already over their limit. Counted on the route rather than
  // per stop, so the driver sees the scale of the problem before starting the day.
  const overLimitStops = useMemo(
    () => initialRestaurants.filter(r => creditByRestaurant.get(r.id)?.exceeded).length,
    [initialRestaurants, creditByRestaurant]
  )

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

        {/* Counted across the route so the driver knows the scale before starting,
            rather than discovering one over-limit kitchen at a time. */}
        {overLimitStops > 0 && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong className="font-semibold">
                {overLimitStops} stop{overLimitStops === 1 ? '' : 's'} on today&apos;s route
              </strong>{' '}
              {overLimitStops === 1 ? 'is' : 'are'} over the agreed credit limit. Deliveries are
              still recorded — check before you leave.
            </p>
          </div>
        )}
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
            const credit = creditByRestaurant.get(stop.id)

            return (
              <div
                key={stop.id}
                className={`bg-white rounded-xl border shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
                  credit?.exceeded
                    ? 'border-amber-300 bg-amber-50/40'
                    : isVerified
                      ? 'border-green-300 bg-green-50/30'
                      : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className={`text-lg font-bold ${(isCompleted || isVerified) ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                      {stop.name}
                    </h3>
                    {/* The warning the database emits on dispatch, surfaced before
                        the driver gets to the door rather than on a statement weeks
                        later. */}
                    {credit?.exceeded && (
                      <span
                        title={`₹${credit.outstanding.toFixed(2)} outstanding against a ₹${credit.credit_limit.toFixed(2)} limit`}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                      >
                        <AlertTriangle className="h-3 w-3" /> Over credit limit
                      </span>
                    )}
                    {!credit?.exceeded && credit && !credit.unlimited && (
                      <span
                        title={`₹${credit.headroom.toFixed(2)} of headroom remaining`}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
                      >
                        ₹{credit.headroom.toFixed(0)} headroom
                      </span>
                    )}
                    {credit?.unlimited && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                        No credit limit
                      </span>
                    )}
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
