"use client"

import Link from "next/link"
import { ArrowLeft, Edit2, Truck, CreditCard } from "lucide-react"
import type { Database } from "@/types/supabase"

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"]

type Transaction = {
  id: string
  type: "collection" | "payment"
  date: string
  amount: number
  status?: string
  reference?: string
}

export default function RestaurantProfile({
  restaurant,
  transactions,
}: {
  restaurant: Restaurant
  transactions: Transaction[]
}) {
  return (
    <>
      <Link
        href="/restaurants"
        className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Restaurants
      </Link>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{restaurant.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{restaurant.address || "No address on file"}</p>
          <div className="mt-2 flex gap-4 text-sm font-medium text-slate-700">
            {restaurant.contact_person && <span>Contact: {restaurant.contact_person}</span>}
            {restaurant.phone && <span>Phone: {restaurant.phone}</span>}
            {restaurant.gst_number && <span>GSTIN: {restaurant.gst_number}</span>}
          </div>
        </div>
        <Link
          href={`/restaurants/${restaurant.id}/edit`}
          className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-md hover:bg-slate-50 text-sm font-medium transition-colors"
        >
          <Edit2 className="h-4 w-4" />
          Edit Profile
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm font-medium text-slate-500">Credit Limit</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            ₹{Number(restaurant.credit_limit).toFixed(2)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm font-medium text-slate-500">Payment Terms</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {restaurant.payment_terms_days} Days
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm font-medium text-slate-500">Status</div>
          <div className="mt-1">
            <span
              className={`px-2 inline-flex text-sm leading-5 font-semibold rounded-full ${
                restaurant.is_active
                  ? "bg-green-100 text-green-800"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {restaurant.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-medium text-slate-900">Transaction History</h2>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No transactions recorded yet.</div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {transactions.map((t) => (
              <li key={`${t.type}-${t.id}`} className="px-6 py-4 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-full ${
                        t.type === "collection"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-green-100 text-green-600"
                      }`}
                    >
                      {t.type === "collection" ? (
                        <Truck className="h-5 w-5" />
                      ) : (
                        <CreditCard className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 capitalize">
                        {t.type} {t.status ? `(${t.status})` : ""}
                      </p>
                      <p className="text-sm text-slate-500">
                        {new Date(t.date).toLocaleDateString()}{" "}
                        {t.reference ? `• ${t.reference}` : ""}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      t.type === "collection" ? "text-slate-900" : "text-green-600"
                    }`}
                  >
                    {t.type === "payment" ? "-" : "+"}₹{Number(t.amount).toFixed(2)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}