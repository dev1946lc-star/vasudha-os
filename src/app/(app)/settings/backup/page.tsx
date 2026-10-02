"use client"

import { useState } from "react"
import { Database, Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react"

type BackupState =
  | { status: "idle" }
  | { status: "downloading" }
  | { status: "done"; incomplete: number }
  | { status: "error"; message: string }

export default function BackupRestorePage() {
  const [state, setState] = useState<BackupState>({ status: "idle" })

  const handleBackup = async () => {
    setState({ status: "downloading" })

    try {
      const res = await fetch("/api/backup")

      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again and retry."
            : `The backup request failed (${res.status}).`
        )
      }

      // The route reports how many of the nine tables came back empty or errored,
      // which a plain <a download> would swallow.
      const incomplete = Number(res.headers.get("X-Backup-Incomplete-Tables") ?? "0")

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `vasudha_os_backup_${new Date().toISOString().split("T")[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setState({ status: "done", incomplete })
    } catch (e) {
      setState({ status: "error", message: (e as Error).message })
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="h-6 w-6 text-slate-700" />
          Backup &amp; Restore
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Safeguard your data by downloading a complete snapshot of your records.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Download className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Export Backup</h2>
              <p className="text-sm text-slate-500">Download a full JSON dump.</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            Exports every restaurant, product, inventory record, collection, invoice
            and payment for your company into a single JSON file. Access control means
            the dump only ever contains your own company&apos;s rows.
          </p>

          <button
            onClick={handleBackup}
            disabled={state.status === "downloading"}
            className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            {state.status === "downloading" ? "Preparing Backup..." : "Download Backup File"}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Restore Data</h2>
              <p className="text-sm text-slate-500">Not available in this version.</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            A restore has to insert nine tables in foreign-key order while preserving
            the original primary keys, and it has to decide what to do when those keys
            already exist. Doing that over the REST API without a transaction risks
            leaving your database half-overwritten, so it is not exposed here.
          </p>

          <button
            disabled
            title="Restore is not implemented"
            className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-slate-100 text-slate-400 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            <Upload className="h-4 w-4" /> Restore Not Available
          </button>

          <p className="mt-3 text-xs text-slate-500">
            To restore, replay the JSON with{" "}
            <code className="font-mono">supabase db reset</code> followed by inserts, or
            ask support to run it against a snapshot.
          </p>
        </div>
      </div>

      {state.status === "done" && state.incomplete === 0 && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-800 font-medium">
            Backup complete. All tables were exported.
          </p>
        </div>
      )}

      {state.status === "done" && state.incomplete > 0 && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 font-medium">
            {state.incomplete} table{state.incomplete === 1 ? "" : "s"} could not be
            exported and appear in the file as error objects. Do not rely on this
            snapshot — check the server logs and retry.
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 font-medium">{state.message}</p>
        </div>
      )}
    </div>
  )
}