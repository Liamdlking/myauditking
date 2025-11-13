import React from 'react'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const cards = [
    { title: 'Templates', to: '/templates', desc: 'Build and manage checklists.' },
    { title: 'Inspections', to: '/inspections', desc: 'Run and review inspections.' },
    { title: 'Actions', to: '/actions', desc: 'Track follow-up actions.' },
    { title: 'Sites', to: '/sites', desc: 'Manage sites and locations.' },
    { title: 'Users', to: '/users', desc: 'Invite and manage users.' },
  ]
  return (
    <div className="max-w-5xl mx-auto py-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map(card => (
        <Link
          key={card.to}
          to={card.to}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition flex flex-col justify-between"
        >
          <div>
            <h2 className="text-lg font-semibold text-royal-700">{card.title}</h2>
            <p className="text-sm text-gray-600 mt-1">{card.desc}</p>
          </div>
          <span className="mt-4 text-xs text-gray-500">Open</span>
        </Link>
      ))}
    </div>
  )
}
