import React from 'react'

export default function UsersPage() {
  return (
    <div className="max-w-4xl mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-royal-700">Users</h1>
        <p className="text-sm text-gray-600">
          In this starter, manage users in Supabase Auth and the profiles table.
          You can later extend this page into a full admin user panel.
        </p>
      </div>
      <div className="bg-white border rounded-2xl p-4 text-sm text-gray-700">
        <p>
          Use the Supabase dashboard to invite users (email/password) and set their roles in the
          public.profiles table (admin / manager / inspector).
        </p>
      </div>
    </div>
  )
}
