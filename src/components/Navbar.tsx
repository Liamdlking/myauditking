import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('ak_session')
    navigate('/login')
  }

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/templates', label: 'Templates' },
    { to: '/inspections', label: 'Inspections' },
    { to: '/actions', label: 'Actions' },
    { to: '/sites', label: 'Sites' },
    { to: '/users', label: 'Users' }
  ]

  return (
    <header className="bg-white border-b shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-royal-700 to-gold-500" />
          <span className="font-extrabold text-lg text-royal-700">
            Audit <span className="text-gold-500">King</span>
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {links.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={
                'px-2 py-1 rounded-md ' +
                (location.pathname === link.to
                  ? 'bg-royal-700 text-white'
                  : 'text-gray-700 hover:bg-gray-100')
              }
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={logout}
            className="ml-2 px-3 py-1 rounded-md border border-gray-300 text-sm hover:bg-gray-100"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  )
}
