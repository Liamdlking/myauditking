import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import AdminGuard from "@/components/AdminGuard";

type Site = {
  id: string;
  name: string;
  code?: string | null;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  pin_code: string | null;
};

type UserSiteRow = {
  user_id: string;
  site_id: string;
};

type UserView = ProfileRow & {
  siteIds: string[]; // which sites this user can see
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserView[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>("all");

  // ---------- load all data ----------
  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Sites
      const { data: sitesData, error: sitesErr } = await supabase
        .from("sites")
        .select("id, name, code")
        .order("name", { ascending: true });

      if (sitesErr) throw sitesErr;

      // Profiles
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, role, pin_code")
        .order("email", { ascending: true });

      if (profilesErr) throw profilesErr;

      // User-site linking table
      const { data: usData, error: usErr } = await supabase
        .from("user_sites")
        .select("user_id, site_id");

      if (usErr) throw usErr;

      const siteRows = (sitesData || []) as Site[];
      const profileRows = (profilesData || []) as ProfileRow[];
      const userSiteRows = (usData || []) as UserSiteRow[];

      const combined: UserView[] = profileRows.map((p) => ({
        ...p,
        role: p.role || "inspector",
        pin_code: p.pin_code || "",
        siteIds: userSiteRows
          .filter((us) => us.user_id === p.user_id)
          .map((us) => us.site_id),
      }));

      setSites(siteRows);
      setUsers(combined);
    } catch (err: any) {
      console.error("UsersPage loadAll error", err);
      setError(
        err?.message ||
          "Could not load users or sites. Check Supabase policies on profiles and user_sites."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ---------- helpers ----------
  const labelForSite = (s: Site) =>
    s.code ? `${s.name} (${s.code})` : s.name;

  const filteredUsers =
    selectedSiteFilter === "all"
      ? users
      : users.filter((u) => u.siteIds.includes(selectedSiteFilter));

  const updateUserLocal = (userId: string, patch: Partial<UserView>) => {
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, ...patch } : u))
    );
  };

  // ---------- mutations ----------
  const saveRole = async (userId: string, role: string) => {
    setSaving(true);
    setError(null);
    try {
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ role })
        .eq("user_id", userId);
      if (updErr) throw updErr;
      updateUserLocal(userId, { role });
    } catch (err: any) {
      console.error("saveRole error", err);
      setError(err?.message || "Could not update role.");
    } finally {
      setSaving(false);
    }
  };

  const saveName = async (userId: string, display_name: string) => {
    setSaving(true);
    setError(null);
    try {
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ display_name })
        .eq("user_id", userId);
      if (updErr) throw updErr;
      updateUserLocal(userId, { display_name });
    } catch (err: any) {
      console.error("saveName error", err);
      setError(err?.message || "Could not update name.");
    } finally {
      setSaving(false);
    }
  };

  const savePin = async (userId: string, pin_code: string) => {
    setSaving(true);
    setError(null);
    try {
      const cleaned = pin_code.trim() || null;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ pin_code: cleaned })
        .eq("user_id", userId);
      if (updErr) throw updErr;
      updateUserLocal(userId, { pin_code: cleaned || "" });
    } catch (err: any) {
      console.error("savePin error", err);
      setError(err?.message || "Could not update PIN code.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSiteAccess = async (
    userId: string,
    siteId: string,
    checked: boolean
  ) => {
    setSaving(true);
    setError(null);
    try {
      if (checked) {
        // add access
        const { error: insErr } = await supabase
          .from("user_sites")
          .insert({ user_id: userId, site_id: siteId });
        if (insErr) throw insErr;

        updateUserLocal(userId, {
          siteIds: [
            ...new Set([
              ...(users.find((u) => u.user_id === userId)?.siteIds || []),
              siteId,
            ]),
          ],
        });
      } else {
        // remove access
        const { error: delErr } = await supabase
          .from("user_sites")
          .delete()
          .eq("user_id", userId)
          .eq("site_id", siteId);
        if (delErr) throw delErr;

        updateUserLocal(userId, {
          siteIds: (
            users.find((u) => u.user_id === userId)?.siteIds || []
          ).filter((id) => id !== siteId),
        });
      }
    } catch (err: any) {
      console.error("toggleSiteAccess error", err);
      setError(err?.message || "Could not update site access.");
    } finally {
      setSaving(false);
    }
  };

  // ---------- render ----------
  return (
    <AdminGuard>
      <div className="max-w-6xl mx-auto py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-purple-700">Users</h1>
            <p className="text-sm text-gray-600">
              Filter by site and manage which sites each user can access.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Filter by site:</label>
            <select
              value={selectedSiteFilter}
              onChange={(e) => setSelectedSiteFilter(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {labelForSite(s)}
                </option>
              ))}
            </select>
            <button
              onClick={loadAll}
              className="px-3 py-2 rounded-xl border text-xs hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
            Loading users…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
            No users found for this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map((u) => (
              <div
                key={u.user_id}
                className="border bg-white rounded-2xl p-4 space-y-3 text-sm"
              >
                {/* Top row: name + email + role + PIN */}
                <div className="grid md:grid-cols-4 gap-3 items-start">
                  {/* Name & email */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Name
                    </label>
                    <input
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      value={u.display_name || ""}
                      onChange={(e) =>
                        updateUserLocal(u.user_id, {
                          display_name: e.target.value,
                        })
                      }
                      onBlur={(e) => saveName(u.user_id, e.target.value)}
                      placeholder="Display name"
                    />
                    <div className="text-[11px] text-gray-400 mt-1 break-all">
                      {u.email || "(no email on profile)"}
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Role
                    </label>
                    <select
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      value={u.role || "inspector"}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        updateUserLocal(u.user_id, { role: newRole });
                        saveRole(u.user_id, newRole);
                      }}
                    >
                      <option value="inspector">Inspector</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <div className="text-[11px] text-gray-400 mt-1">
                      Admins can manage users, sites, templates and actions.
                    </div>
                  </div>

                  {/* PIN */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Quick PIN code
                    </label>
                    <input
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      value={u.pin_code || ""}
                      onChange={(e) =>
                        updateUserLocal(u.user_id, {
                          pin_code: e.target.value,
                        })
                      }
                      onBlur={(e) => savePin(u.user_id, e.target.value)}
                      placeholder="e.g. 1234 (optional)"
                    />
                    <div className="text-[11px] text-gray-400 mt-1">
                      Optional short code for quick worker switching on shared
                      devices.
                    </div>
                  </div>

                  {/* Sites access */}
                  <div>
                    <div className="block text-xs text-gray-500 mb-1">
                      Sites access
                    </div>
                    {sites.length === 0 ? (
                      <div className="text-[11px] text-gray-400">
                        No sites yet. Create sites first on the Sites page.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-32 overflow-auto border rounded-xl p-2">
                        {sites.map((s) => {
                          const checked = u.siteIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="inline-flex items-center gap-2 text-[11px] text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  toggleSiteAccess(
                                    u.user_id,
                                    s.id,
                                    e.target.checked
                                  )
                                }
                              />
                              <span>{labelForSite(s)}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {saving && (
                  <div className="text-[11px] text-gray-400">
                    Saving changes…
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminGuard>
  );
}