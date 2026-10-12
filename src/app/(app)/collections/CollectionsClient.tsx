"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import {
  Plus,
  MapPin,
  Truck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  AlertCircle,
  Play,
  UserCheck,
  FileText,
  Filter,
  X
} from "lucide-react"
import { useAppStore } from "@/store"

type Restaurant = {
  id: string
  name: string
  address: string | null
  contact_person: string | null
  phone: string | null
}

type CreditStatus = {
  restaurant_id: string
  outstanding: number
  credit_limit: number
  headroom: number
  exceeded: boolean
  unlimited: boolean
}

export type Collection = {
  id: string
  restaurant_id: string
  status: string
  total_amount: number
  agent_id?: string | null
  not_available_reason?: string | null
  verified_at?: string | null
}

interface Props {
  initialRestaurants: Restaurant[]
  initialCollections: Collection[]
  initialCredit: CreditStatus[]
  currentUserId?: string
  currentUserRole?: string
}

const COMMON_UNAVAILABLE_REASONS = [
  "Restaurant closed / shutters down",
  "Manager / Chef not present",
  "No materials ready for collection",
  "Access temporarily blocked / renovation",
  "Other reason",
]

export default function CollectionsClient({
  initialRestaurants,
  initialCollections,
  initialCredit,
  currentUserId,
  currentUserRole,
}: Props) {
  const storeUser = useAppStore((state) => state.user)
  const role = currentUserRole || storeUser?.role || "agent"
  const activeUserId = currentUserId || storeUser?.id

  const isManagerOrOwner = role === "manager" || role === "owner" || role === "accountant"
  const isAgent = role === "agent"

  const [collections, setCollections] = useState<Collection[]>(initialCollections)
  const [credit, setCredit] = useState<CreditStatus[]>(initialCredit)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Modal state for marking "Not Available"
  const [unavailableModalStop, setUnavailableModalStop] = useState<{
    restaurantId: string
    restaurantName: string
    collectionId?: string
  } | null>(null)
  const [selectedReason, setSelectedReason] = useState(COMMON_UNAVAILABLE_REASONS[0])
  const [customReason, setCustomReason] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadCredit() {
      const ids = initialRestaurants.map((r) => r.id)
      if (ids.length === 0) return

      const results = await Promise.all(
        ids.map(async (id): Promise<CreditStatus | null> => {
          try {
            const { data, error } = await supabase.rpc("restaurant_credit_exposure", {
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
            return null
          }
        })
      )

      if (!cancelled) {
        setCredit(results.filter((r): r is CreditStatus => r !== null))
      }
    }

    loadCredit()
    return () => {
      cancelled = true
    }
  }, [initialRestaurants])

  const creditByRestaurant = useMemo(
    () => new Map(credit.map((c) => [c.restaurant_id, c])),
    [credit]
  )

  const collectionsByRestaurant = useMemo(
    () => new Map(collections.map((c) => [c.restaurant_id, c])),
    [collections]
  )

  const overLimitStops = useMemo(
    () => initialRestaurants.filter((r) => creditByRestaurant.get(r.id)?.exceeded).length,
    [initialRestaurants, creditByRestaurant]
  )

  // Merge today's route with live collections
  const mergedRoute = useMemo(() => {
    return initialRestaurants.map((restaurant) => {
      const col = collectionsByRestaurant.get(restaurant.id)
      return {
        ...restaurant,
        collection_id: col?.id,
        status: col?.status || "pending_visit",
        amount: col?.total_amount || 0,
        not_available_reason: col?.not_available_reason,
        verified_at: col?.verified_at,
        agent_id: col?.agent_id,
      }
    })
  }, [initialRestaurants, collectionsByRestaurant])

  // Filtered stops
  const displayedRoute = useMemo(() => {
    if (statusFilter === "all") return mergedRoute
    if (statusFilter === "pending") {
      return mergedRoute.filter(
        (r) => r.status === "pending" || r.status === "pending_visit" || r.status === "assigned"
      )
    }
    return mergedRoute.filter((r) => r.status === statusFilter)
  }, [mergedRoute, statusFilter])

  // Handlers for collection state transitions
  const handleStartVisit = useCallback(
    async (restaurantId: string, existingCollectionId?: string) => {
      setActionInProgress(restaurantId)
      try {
        if (existingCollectionId) {
          const { error } = await supabase
            .from("collections")
            .update({ status: "in_progress" })
            .eq("id", existingCollectionId)

          if (error) throw error

          setCollections((prev) =>
            prev.map((c) => (c.id === existingCollectionId ? { ...c, status: "in_progress" } : c))
          )
        } else {
          // Create initial collection with in_progress status
          const today = new Date().toISOString().split("T")[0]
          const { data, error } = await supabase
            .from("collections")
            .insert({
              restaurant_id: restaurantId,
              status: "in_progress",
              collection_date: today,
              company_id: "", // Injected by RLS default or trigger
              agent_id: activeUserId || "",
            })
            .select("id, restaurant_id, status, total_amount, not_available_reason, verified_at, agent_id")
            .single()

          if (error) throw error
          if (data) {
            setCollections((prev) => [...prev, data as Collection])
          }
        }
      } catch (err: unknown) {
        const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err)
        alert("Failed to update status to in_progress: " + msg)
      } finally {
        setActionInProgress(null)
      }
    },
    [activeUserId]
  )

  const handleOpenUnavailableModal = (
    restaurantId: string,
    restaurantName: string,
    collectionId?: string
  ) => {
    setUnavailableModalStop({ restaurantId, restaurantName, collectionId })
    setSelectedReason(COMMON_UNAVAILABLE_REASONS[0])
    setCustomReason("")
  }

  const handleConfirmUnavailable = async () => {
    if (!unavailableModalStop) return
    const reasonToSave =
      selectedReason === "Other reason" ? customReason.trim() : selectedReason

    if (!reasonToSave) {
      alert("A reason is required when marking a restaurant unavailable.")
      return
    }

    const { restaurantId, collectionId } = unavailableModalStop
    setActionInProgress(restaurantId)

    try {
      if (collectionId) {
        const { error } = await supabase
          .from("collections")
          .update({
            status: "not_available",
            not_available_reason: reasonToSave,
          })
          .eq("id", collectionId)

        if (error) throw error

        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId
              ? { ...c, status: "not_available", not_available_reason: reasonToSave }
              : c
          )
        )
      } else {
        const today = new Date().toISOString().split("T")[0]
        const { data, error } = await supabase
          .from("collections")
          .insert({
            restaurant_id: restaurantId,
            status: "not_available",
            not_available_reason: reasonToSave,
            collection_date: today,
            company_id: "",
            agent_id: activeUserId || "",
          })
          .select("id, restaurant_id, status, total_amount, not_available_reason, verified_at, agent_id")
          .single()

        if (error) throw error
        if (data) {
          setCollections((prev) => [...prev, data as Collection])
        }
      }
      setUnavailableModalStop(null)
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err)
      alert("Failed to mark stop unavailable: " + msg)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleVerify = useCallback(async (collectionId: string) => {
    if (!window.confirm("Mark this collection as verified? It will be locked from further edits.")) return

    setActionInProgress(collectionId)
    const { error } = await supabase
      .from("collections")
      .update({ status: "verified" })
      .eq("id", collectionId)

    if (error) {
      alert("Verification failed: " + error.message)
    } else {
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId ? { ...c, status: "verified", verified_at: new Date().toISOString() } : c
        )
      )
    }
    setActionInProgress(null)
  }, [])

  const handleCancelStop = useCallback(async (collectionId: string) => {
    if (!window.confirm("Are you sure you want to cancel this collection stop?")) return

    setActionInProgress(collectionId)
    const { error } = await supabase
      .from("collections")
      .update({ status: "cancelled" })
      .eq("id", collectionId)

    if (error) {
      alert("Cancellation failed: " + error.message)
    } else {
      setCollections((prev) =>
        prev.map((c) => (c.id === collectionId ? { ...c, status: "cancelled" } : c))
      )
    }
    setActionInProgress(null)
  }, [])

  // Route metrics
  const completedCount = mergedRoute.filter(
    (r) => r.status === "completed" || r.status === "verified"
  ).length
  const unavailableCount = mergedRoute.filter((r) => r.status === "not_available").length
  const inProgressCount = mergedRoute.filter((r) => r.status === "in_progress").length
  const totalCount = mergedRoute.length
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  // Render badge helper for the 8 collection machine states
  const renderStatusBadge = (status: string, reason?: string | null) => {
    switch (status) {
      case "verified":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="h-3 w-3" /> Verified
          </span>
        )
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <CheckCircle2 className="h-3 w-3" /> Collected
          </span>
        )
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200 animate-pulse">
            <Truck className="h-3 w-3" /> In Progress
          </span>
        )
      case "assigned":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
            <UserCheck className="h-3 w-3" /> Assigned
          </span>
        )
      case "not_available":
        return (
          <span
            title={reason ? `Reason: ${reason}` : undefined}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200"
          >
            <AlertCircle className="h-3 w-3" /> Shop Unavailable
          </span>
        )
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <XCircle className="h-3 w-3" /> Cancelled
          </span>
        )
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <FileText className="h-3 w-3" /> Draft
          </span>
        )
      case "pending":
      case "pending_visit":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="h-3 w-3" /> Pending Visit
          </span>
        )
    }
  }

  return (
    <>
      {/* Route Scoping and Overview Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">Route Execution</span>
              {isAgent && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                  Agent Scoped (My Stops)
                </span>
              )}
              {isManagerOrOwner && (
                <span className="px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-md border border-purple-200">
                  Supervisor View (All Stops)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              State transitions conform strictly to the 8-state operations machine.
            </p>
          </div>
          <div className="text-sm text-slate-600">
            <span className="font-bold text-slate-900">{completedCount}</span> visited •{" "}
            <span className="font-medium text-indigo-600">{inProgressCount}</span> in progress •{" "}
            <span className="font-medium text-rose-600">{unavailableCount}</span> unavailable of{" "}
            <span className="font-bold text-slate-900">{totalCount}</span> total
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Over-limit credit warning banner */}
        {overLimitStops > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong className="font-semibold">
                {overLimitStops} stop{overLimitStops === 1 ? "" : "s"} on today&apos;s route
              </strong>{" "}
              {overLimitStops === 1 ? "is" : "are"} over the agreed credit limit. Deliveries are still
              recorded — check with customer before dispatching.
            </p>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 overflow-x-auto text-xs">
          <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filter:
          </span>
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              statusFilter === "all"
                ? "bg-slate-900 text-white font-medium"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setStatusFilter("pending")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              statusFilter === "pending"
                ? "bg-amber-600 text-white font-medium"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Pending ({totalCount - completedCount - unavailableCount})
          </button>
          <button
            onClick={() => setStatusFilter("in_progress")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              statusFilter === "in_progress"
                ? "bg-indigo-600 text-white font-medium"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            In Progress ({inProgressCount})
          </button>
          <button
            onClick={() => setStatusFilter("completed")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              statusFilter === "completed"
                ? "bg-blue-600 text-white font-medium"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Collected ({collections.filter((c) => c.status === "completed").length})
          </button>
          <button
            onClick={() => setStatusFilter("verified")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              statusFilter === "verified"
                ? "bg-emerald-600 text-white font-medium"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Verified ({collections.filter((c) => c.status === "verified").length})
          </button>
          <button
            onClick={() => setStatusFilter("not_available")}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              statusFilter === "not_available"
                ? "bg-rose-600 text-white font-medium"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Unavailable ({unavailableCount})
          </button>
        </div>
      </div>

      {/* Stop List */}
      <div className="space-y-4">
        {displayedRoute.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
            <Truck className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium text-slate-700">No route stops in this view.</p>
            <p className="text-xs text-slate-400 mt-1">
              Select another status filter above to inspect stops.
            </p>
          </div>
        ) : (
          displayedRoute.map((stop) => {
            const isCompleted = stop.status === "completed"
            const isVerified = stop.status === "verified"
            const isInProgress = stop.status === "in_progress"
            const isUnavailable = stop.status === "not_available"
            const isCancelled = stop.status === "cancelled"
            const isActionPending =
              actionInProgress === stop.id || actionInProgress === stop.collection_id
            const credit = creditByRestaurant.get(stop.id)

            return (
              <div
                key={stop.id}
                className={`bg-white rounded-xl border shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
                  credit?.exceeded
                    ? "border-amber-300 bg-amber-50/30"
                    : isVerified
                    ? "border-emerald-300 bg-emerald-50/20"
                    : isUnavailable
                    ? "border-rose-200 bg-rose-50/20"
                    : isInProgress
                    ? "border-indigo-300 bg-indigo-50/20"
                    : "border-slate-200 hover:border-blue-300"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3
                      className={`text-lg font-bold ${
                        isCompleted || isVerified || isCancelled ? "text-slate-500" : "text-slate-900"
                      }`}
                    >
                      {stop.name}
                    </h3>

                    {/* 8-state badge */}
                    {renderStatusBadge(stop.status, stop.not_available_reason)}

                    {/* Credit alerts */}
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
                  </div>

                  <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <MapPin className="size-4 text-slate-400 shrink-0" />
                    <span className="line-clamp-1">{stop.address || "No address on file"}</span>
                  </p>
                  <p className="mt-0.5 pl-5 text-sm text-slate-500">
                    {[stop.contact_person, stop.phone].filter(Boolean).join(" • ") || "No contact on file"}
                  </p>

                  {/* Unavailable reason notice */}
                  {isUnavailable && stop.not_available_reason && (
                    <div className="mt-2.5 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-1.5">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                      <div>
                        <strong>Unavailable Reason:</strong> {stop.not_available_reason}
                      </div>
                    </div>
                  )}
                </div>

                {/* State Machine Transition Actions */}
                <div className="w-full sm:w-auto mt-4 sm:mt-0 flex flex-col items-end gap-2 shrink-0">
                  {isVerified ? (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Locked Value</div>
                        <div className="text-lg font-bold text-emerald-700">₹{stop.amount}</div>
                      </div>
                      <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                        Locked &amp; Frozen
                      </span>
                    </div>
                  ) : isCompleted ? (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Total Collected</div>
                        <div className="text-lg font-bold text-slate-900">₹{stop.amount}</div>
                      </div>

                      {/* Verify button is strictly manager/owner only */}
                      {isManagerOrOwner && stop.collection_id && (
                        <button
                          onClick={() => handleVerify(stop.collection_id!)}
                          disabled={isActionPending}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-60"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          {isActionPending ? "Verifying..." : "Verify & Lock"}
                        </button>
                      )}

                      {isAgent && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
                          Awaiting Verification
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                      {/* Transition: pending -> in_progress */}
                      {(stop.status === "pending" ||
                        stop.status === "pending_visit" ||
                        stop.status === "assigned") && (
                        <button
                          onClick={() => handleStartVisit(stop.id, stop.collection_id)}
                          disabled={isActionPending}
                          className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <Play className="h-3.5 w-3.5" /> Start Visit
                        </button>
                      )}

                      {/* Transition: record collection */}
                      {!isCancelled && !isUnavailable && (
                        <Link
                          href={`/collections/new?restaurant_id=${stop.id}`}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-bold shadow-sm transition-colors"
                        >
                          <Plus className="h-4 w-4" /> Record Collection
                        </Link>
                      )}

                      {/* Transition: not_available (with reason modal) */}
                      {!isCancelled && !isUnavailable && (
                        <button
                          onClick={() =>
                            handleOpenUnavailableModal(stop.id, stop.name, stop.collection_id)
                          }
                          disabled={isActionPending}
                          className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg text-xs font-medium transition-colors"
                        >
                          Mark Unavailable
                        </button>
                      )}

                      {/* Cancel action */}
                      {!isCancelled && stop.collection_id && isManagerOrOwner && (
                        <button
                          onClick={() => handleCancelStop(stop.collection_id!)}
                          disabled={isActionPending}
                          className="px-2.5 py-2 text-slate-400 hover:text-slate-600 text-xs font-medium"
                          title="Cancel stop"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal for "Mark Not Available" (Migration 33 requirement: Reason is mandatory) */}
      {unavailableModalStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Mark Restaurant Unavailable</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stop for: <strong className="text-slate-700">{unavailableModalStop.restaurantName}</strong>
                </p>
              </div>
              <button
                onClick={() => setUnavailableModalStop(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-800">
              A reason is mandatory in the database state machine to distinguish a shut restaurant from a missed stop.
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">Select Reason:</label>
              <div className="space-y-1.5">
                {COMMON_UNAVAILABLE_REASONS.map((r) => (
                  <label
                    key={r}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs ${
                      selectedReason === r
                        ? "border-blue-600 bg-blue-50/50 text-blue-900 font-medium"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="unavailableReason"
                      value={r}
                      checked={selectedReason === r}
                      onChange={() => setSelectedReason(r)}
                      className="text-blue-600"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>

              {selectedReason === "Other reason" && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Describe reason:
                  </label>
                  <textarea
                    rows={2}
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Provide detailed explanation..."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnavailableModalStop(null)}
                className="flex-1 py-2 px-3 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnavailable}
                disabled={actionInProgress !== null}
                className="flex-1 py-2 px-3 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {actionInProgress ? "Saving..." : "Confirm Unavailable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
