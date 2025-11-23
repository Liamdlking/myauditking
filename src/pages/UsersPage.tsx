// src/pages/UsersPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type Role = "admin" | "manager" | "inspector" | string | null;

type SiteRow = {
  id: string;
  name: string;
};

type UserRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  role: Role;
  site_access: string[];
  is_banned: boolean;
};

export default function UsersPage() {
  const [currentRole, setCurrentRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  // --------------------------
  // Load current user (must be admin) + sites + users
  // --------------------------
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) Current user + role
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          setError("You must be logged in to view this page.");
          setLoading(false);
          return;
        }

        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (profileErr) {
          console.error("load current profile error", profileErr);
          setError("Could not load your profile.");
          setLoading(false);
          return;
        }

        const r = (profile?.role as Role) || "inspector";
        setCurrentRole(r);

        if (r !== "admin") {
          // Only admins can use this page
          setError("Only admins can manage users.");
          setLoading(false);
          return;
        }

        // 2) Sites
        const { data: sitesData, error: sitesErr } = await supabase
          .from("sites")
          .select("id, name")
          .order("name", { ascending: true });

        if (sitesErr) throw sitesErr;

        const mappedSites: SiteRow[] = (sitesData || []).map((s: any) => ({
          id: s.id,
          name: s.name,
        }));
        setSites(mappedSites);

        // 3) Users (profiles)
        const { data: profiles, error: profilesErr } = await supabase
          .from("profiles")
          .select("user_id, email, name, role, site_access, is_banned")
          .order("email", { ascending: true });

        if (profilesErr) throw profilesErr;

        const mappedUsers: UserRow[] = (profiles || []).map((p: any) => ({
          user_id: p.user_id,
          email: p.email ?? null,
          name: p.name ?? null,
          role: (p.role as Role) || "inspector",
          site_access: (p.site_access as string[] | null) || [],
          is_banned: !!p.is_banned,
        }));

        setUsers(mappedUsers);
      } catch (e: any) {
        console.error("UsersPage init error", e);
        setError(e?.message || "Could not load users.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const isAdmin = currentRole === "admin";

  // --------------------------
  // Local mutators
  // --------------------------
  const updateUserField = (
    userId: string,
    patch: Partial<Pick<UserRow, "role" | "site_access" | "is_banned">>
  ) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.user_id === userId ? { ...u, ...patch } : u
      )
    );
  };

  const toggleSiteForUser = (userId: string, siteId: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.user_id !== userId) return u;
        const has = u.site_access.includes(siteId);
        return {
          ...u,
          site_access: has
            ? u.site_access.filter((id) => id !== siteId)
            : [...u.site_access, siteId],
        };
      })
    );
  };

  // --------------------------
  // Save changes for a single user
  // --------------------------
  const handleSaveUser = async (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    // Safety: never let admin lock themselves out accidentally (optional)
    // You can remove this guard if you want full freedom.
    try {
      setSavingUserId(userId);
      setError(null);

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          role: user.role,
          site_access:
            user.role === "admin" ? null : user.site_access, // admins don't need site restriction
          is_banned: user.is_banned,
        })
        .eq("user_id", user.user_id);

      if (updateErr) throw updateErr;

      alert("User updated.");
    } catch (e: any) {
      console.error("handleSaveUser error", e);
      setError(e?.message || "Could not update user.");
    } finally {
      setSavingUserId(null);
    }
  };

  // --------------------------
  // Render
  // --------------------------
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-6">
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          Loading users…
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-5xl mx-auto py-6">
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          {error || "Only admins can view this page."}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">Users</h1>
          <p className="text-sm text-gray-600">
            Assign roles and sites. Managers and inspectors can only see and
            work with templates/inspections for their assigned sites.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {users.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          No users found.
        </div>
      ) : (
        <div className="rounded-2xl border bg-white overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-3 py-2 font-semibold text-gray-700">
                  User
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">
                  Role
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">
                  Sites (for managers/inspectors)
                </th>
                <th className="text-left px-3 py-2 font-semibold text-gray-700">
                  Status
                </th>
                <th className="text-right px-3 py-2 font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isRowSaving = savingUserId === u.user_id;
                const isAdminRole = u.role === "admin";

                return (
                  <tr key={u.user_id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">
                        {u.name || u.email || "(no name)"}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {u.email || "No email"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={u.role || "inspector"}
                        onChange={(e) =>
                          updateUserField(u.user_id, {
                            role: e.target.value as Role,
                          })
                        }
                        className="border rounded-xl px-2 py-1 text-xs"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="inspector">Inspector</option>
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Admins automatically see all sites.
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {isAdminRole ? (
                        <div className="text-[11px] text-gray-500">
                          Admin – site restrictions are ignored.
                        </div>
                      ) : sites.length === 0 ? (
                        <div className="text-[11px] text-gray-500">
                          No sites configured.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 max-w-xs">
                          {sites.map((s) => {
                            const checked = u.site_access.includes(s.id);
                            return (
                              <label
                                key={s.id}
                                className="inline-flex items-center gap-1 border rounded-xl px-2 py-1 text-[11px] cursor-pointer bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleSiteForUser(u.user_id, s.id)
                                  }
                                />
                                <span>{s.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-1 text-[11px]">
                        <input
                          type="checkbox"
                          checked={u.is_banned}
                          onChange={(e) =>
                            updateUserField(u.user_id, {
                              is_banned: e.target.checked,
                            })
                          }
                        />
                        <span>{u.is_banned ? "Banned" : "Active"}</span>
                      </label>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleSaveUser(u.user_id)}
                        disabled={isRowSaving}
                        className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        {isRowSaving ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        Rules summary: Admins see all sites. Managers/inspectors only see
        templates and inspections for the sites you assign here. Managers can
        only create templates for their own sites.
      </p>
    </div>
  );
}