"use client"

import { useState, useRef } from "react"
import { Database, Download, Upload, AlertTriangle, CheckCircle2, FileText, RefreshCw, X } from "lucide-react"

type BackupState =
  | { status: "idle" }
  | { status: "downloading" }
  | { status: "done"; incomplete: number }
  | { status: "error"; message: string }

type RestoreState =
  | { status: "idle" }
  | { status: "file_selected"; fileName: string; fileSize: string; parsed: Record<string, unknown> }
  | { status: "restoring" }
  | { status: "done"; restored: Record<string, number>; errors: string[] }
  | { status: "error"; message: string }

export default function BackupRestorePage() {
  const [backupState, setBackupState] = useState<BackupState>({ status: "idle" })
  const [restoreState, setRestoreState] = useState<RestoreState>({ status: "idle" })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleBackup = async () => {
    setBackupState({ status: "downloading" })

    try {
      const res = await fetch("/api/backup")

      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again and retry."
            : `The backup request failed (${res.status}).`
        )
      }

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

      setBackupState({ status: "done", incomplete })
    } catch (e) {
      setBackupState({ status: "error", message: (e as Error).message })
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const json = JSON.parse(text)

      if (typeof json !== "object" || json === null) {
        throw new Error("Invalid backup format: File does not contain a JSON object.")
      }

      const sizeFormatted = (file.size / 1024).toFixed(1) + " KB"
      setRestoreState({
        status: "file_selected",
        fileName: file.name,
        fileSize: sizeFormatted,
        parsed: json,
      })
    } catch (err) {
      setRestoreState({
        status: "error",
        message: "Failed to read backup file: " + (err instanceof Error ? err.message : String(err)),
      })
    }
  }

  const handleConfirmRestore = async () => {
    if (restoreState.status !== "file_selected") return

    if (
      !window.confirm(
        "Are you sure you want to restore this data?\n\nExisting records with matching IDs will be updated. Your company isolation is enforced."
      )
    ) {
      return
    }

    const payload = restoreState.parsed
    setRestoreState({ status: "restoring" })

    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Restore failed (${res.status})`)
      }

      setRestoreState({
        status: "done",
        restored: data.restored || {},
        errors: data.errors || [],
      })
    } catch (err) {
      setRestoreState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="h-6 w-6 text-slate-700" />
          Backup &amp; Restore
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Safeguard your data by downloading complete snapshots or restoring previous state.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* EXPORT CARD */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col justify-between">
          <div>
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
              Exports every restaurant, product, inventory record, collection, invoice, payment, and
              stock ledger entry for your company into a single JSON file. Tenant isolation guarantees
              the export only contains your company&apos;s records.
            </p>
          </div>

          <div>
            <button
              onClick={handleBackup}
              disabled={backupState.status === "downloading"}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              {backupState.status === "downloading" ? "Preparing Backup..." : "Download Backup File"}
            </button>
          </div>
        </div>

        {/* RESTORE CARD */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Restore Data</h2>
                <p className="text-sm text-slate-500">Restore from JSON backup file.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Upload a previously downloaded JSON backup file to restore records. Data is safely
              upserted in foreign-key dependency order with company ownership enforced.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            {restoreState.status === "file_selected" && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-4 text-xs space-y-1">
                <div className="flex justify-between items-center font-medium text-slate-800">
                  <span className="flex items-center gap-1.5 truncate">
                    <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                    {restoreState.fileName}
                  </span>
                  <button
                    onClick={() => {
                      setRestoreState({ status: "idle" })
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="text-slate-500">File size: {restoreState.fileSize}</div>
                <div className="text-emerald-700 pt-1 font-medium">
                  Detected tables: {Object.keys(restoreState.parsed).join(", ")}
                </div>
              </div>
            )}
          </div>

          <div>
            {restoreState.status === "file_selected" ? (
              <button
                onClick={handleConfirmRestore}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm transition-colors"
              >
                <RefreshCw className="h-4 w-4" /> Start Restore
              </button>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={restoreState.status === "restoring"}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {restoreState.status === "restoring" ? "Restoring Records..." : "Select Backup File"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Backup Feedback */}
      {backupState.status === "done" && backupState.incomplete === 0 && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-800 font-medium">
            Backup complete. All 10 tables were exported successfully.
          </p>
        </div>
      )}

      {backupState.status === "done" && backupState.incomplete > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 font-medium">
            {backupState.incomplete} table{backupState.incomplete === 1 ? "" : "s"} could not be
            exported. Check server logs and retry.
          </p>
        </div>
      )}

      {backupState.status === "error" && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 font-medium">{backupState.message}</p>
        </div>
      )}

      {/* Restore Feedback */}
      {restoreState.status === "done" && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-emerald-900 font-bold">
                Restore completed successfully!
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                The following records were restored into your company:
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
            {Object.entries(restoreState.restored).map(([tbl, count]) => (
              <div key={tbl} className="bg-white/80 p-2 rounded border border-emerald-200">
                <span className="font-semibold text-slate-800">{tbl}:</span>{" "}
                <span className="text-emerald-700 font-bold">{count} rows</span>
              </div>
            ))}
          </div>
          {restoreState.errors.length > 0 && (
            <div className="text-xs text-amber-800 pt-2 border-t border-emerald-200">
              Warnings: {restoreState.errors.join("; ")}
            </div>
          )}
        </div>
      )}

      {restoreState.status === "error" && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-800 font-semibold">Restore Error</p>
            <p className="text-xs text-red-700 mt-0.5">{restoreState.message}</p>
          </div>
        </div>
      )}
    </div>
  )
}