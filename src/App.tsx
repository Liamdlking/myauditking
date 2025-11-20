import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './utils/supabaseClient'
import type { CurrentUser } from './types'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TemplatesPage from './pages/TemplatesPage'
import InspectionsPage from './pages/InspectionsPage'
import ActionsPage from './pages/ActionsPage'
import SitesPage from './pages/SitesPage'
import UsersPage from './pages/UsersPage'
import TemplateEditorPage from './pages/TemplateEditorPage'
import Navbar from './components/Navbar'

function useSession() {
  const [session, setSession] = useState<any | null>(null)
  useEffect(() => {
    const raw = localStorage.getItem('ak_session')
    if (raw) {
      try {
        setSession(JSON.parse(raw))
      } catch {
        setSession(null)
      }
    }
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) {
        setSession(s)
        localStorage.setItem('ak_session', JSON.stringify(s))
      } else {
        setSession(null)
        localStorage.removeItem('ak_session')
      }
    })
    return () => {
      listener?.subscription.unsubscribe()
    }
  }, [])
  return { session, setSession }
}

function AppShell() {
  const { session, setSession } = useSession()
  const location = useLocation()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    async function loadProfile() {
      if (!session) {
        setCurrentUser(null)
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,name,role,site_access,is_banned')
        .eq('id', session.user.id)
        .single()
      if (error || !data) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.email || '',
          role: 'inspector',
          site_access: [],
          is_banned: false
        })
      } else {
        setCurrentUser({
          id: data.id,
          email: data.email || '',
          name: data.name,
          role: (data.role as any) || 'inspector',
          site_access: data.site_access || [],
          is_banned: data.is_banned
        })
      }
    }
    loadProfile()
  }, [session])

  if (!session) {
    if (location.pathname !== '/login') {
      return <Navigate to="/login" replace />
    }
    return <LoginPage onLogin={setSession} />
  }

  if (currentUser?.is_banned) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-2xl border p-6 text-center space-y-3 max-w-md">
          <h1 className="text-xl font-bold text-royal-700">Account disabled</h1>
          <p className="text-sm text-gray-600">
            Your account has been marked as banned. Please contact an administrator.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              localStorage.removeItem('ak_session')
              window.location.href = '/login'
            }}
            className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50"
          >
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 px-4 py-4">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          {/* NEW: full template editor routes */}
          <Route path="/templates/new" element={<TemplateEditorPage mode="create" />} />
          <Route path="/templates/:id/edit" element={<TemplateEditorPage mode="edit" />} />

          <Route path="/inspections" element={<InspectionsPage />} />
          <Route path="/actions" element={<ActionsPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/login" element={<LoginPage onLogin={setSession} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return <AppShell />
}