import Link from "next/link"
import { Building2, Calculator, Database, Users } from "lucide-react"

export default function SettingsPage() {
  const settingsLinks = [
    {
      title: "Company Profile",
      description: "Manage your business name, GSTIN, address, and logo for invoices.",
      icon: Building2,
      href: "/settings/company",
      color: "text-blue-600",
      bg: "bg-blue-50"
    },
    {
      title: "Tax Configuration",
      description: "Set your default GST slabs for new products.",
      icon: Calculator,
      href: "/settings/tax",
      color: "text-purple-600",
      bg: "bg-purple-50"
    },
    {
      title: "User Management",
      description: "Add new agents, accountants, or revoke access instantly.",
      icon: Users,
      href: "/settings/users",
      color: "text-indigo-600",
      bg: "bg-indigo-50"
    },
    {
      title: "Backup & Restore",
      description: "Download a full offline copy of your database.",
      icon: Database,
      href: "/settings/backup",
      color: "text-emerald-600",
      bg: "bg-emerald-50"
    }
  ]

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your workspace and administrative preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {settingsLinks.map((link) => (
          <Link 
            key={link.href}
            href={link.href}
            className="block group bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-all hover:border-slate-300 overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${link.bg} ${link.color}`}>
                  <link.icon className="h-6 w-6" />
                </div>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                {link.title}
              </h2>
              <p className="text-sm text-slate-500 line-clamp-2">
                {link.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
