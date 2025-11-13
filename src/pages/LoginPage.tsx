import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'

type Props = {
  onLogin: (session: any) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    if (data.session) {
      localStorage.setItem('ak_session', JSON.stringify(data.session))
      onLogin(data.session)
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-royal-700 to-gold-500">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center text-royal-700">Audit King Pro</h1>
        <p className="text-sm text-gray-600 text-center">
          Sign in with your admin-created account.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="you@company.com"
          />
          <input
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            required
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Password"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-royal-700 text-white rounded-xl py-2 text-sm hover:bg-royal-800"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        {error && <p className="text-sm text-rose-600 text-center">{error}</p>}
        <p className="text-xs text-gray-500 text-center">
          New users must be invited by an admin.
        </p>
      </div>
    </div>
  )
}
