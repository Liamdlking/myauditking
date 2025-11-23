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
  site_access: string[]; // empty array = no sites; admin uses null in DB
  is_banned: boolean;
};

export default function UsersPage() {
  const [currentRole, setCurrentRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  // Single-user create
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState<Role>("inspector");
  const [newSiteIds, setNewSiteIds] = useState<string[]>([]);
  const [creatingSingle, setCreatingSingle] = useState(false);

  // Bulk create
  const [bulkCsv, setBulkCsv] = useState("");
  const [creatingBulk, setCreatingBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // --------------------------
  // Load sites + users helpers
  // --------------------------
  const loadSites = async () => {
    const { data, error } = await supabase
      .from("sites")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;

    const mapped: SiteRow[] = (data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
    }));
    setSites(mapped);
  };

  const loadUsers = async () => {
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
      // if site_access is null in DB, treat as [] in state (admins get null on save)
      site_access: (p.site_access as string[] | null) || [],
      is_banned: !!p.is_banned,
    }));

    setUsers(mappedUsers);
  };

  // --------------------------
  // Init: ensure current user is admin, then load sites + users
  // --------------------------
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
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

        const r: Role = (profile?.role as Role) || "inspector";
        setCurrentRole(r);

        if (r !== "admin") {
          setError("Only admins can manage users.");
          setLoading(false);
          return;
        }

        await loadSites();
        await loadUsers();
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

  const toggleNewUserSite = (siteId: string) => {
    setNewSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  };

  // --------------------------
  // Save an existing user
  // --------------------------
  const handleSaveUser = async (userId: string) => {
    const user = users.find((u) => u.user_id === userId);
    if (!user) return;

    try {
      setSavingUserId(userId);
      setError(null);

      // Admins: site_access = null (they can see all sites)
      // Others: site_access = array of site IDs
      const payload = {
        role: user.role,
        site_access: user.role === "admin" ? null : user.site_access,
        is_banned: user.is_banned,
      };

      const { error: updateErr } = await supabase
        .from("profiles")
        .update(payload)
        .eq("user_id", user.user_id);

      if (updateErr) throw updateErr;

      alert("User updated.");
      // Optional: reload from DB so UI always matches DB
      await loadUsers();
    } catch (e: any) {
      console.error("handleSaveUser error", e);
      setError(e?.message || "Could not update user.");
    } finally {
      setSavingUserId(null);
    }
  };

  // --------------------------
  // Create single user
  // --------------------------
  const handleCreateSingleUser = async () => {
    if (!newEmail.trim() || !newPin.trim()) {
      alert("Email and PIN are required.");
      return;
    }

    if (newPin.length < 4) {
      alert("Please use at least a 4-digit PIN.");
      return;
    }

    try {
      setCreatingSingle(true);
      setError(null);

      // 1) Create auth user (password = PIN)
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: newEmail.trim(),
        password: newPin,
      });

      if (signUpErr) throw signUpErr;

      const createdUser = data.user;
      if (!createdUser) {
        throw new Error("User was not created.");
      }

      // 2) Insert profile
      const site_access =
        newRole === "admin" ? null : newSiteIds;

      const { error: profileErr } = await supabase
        .from("profiles")
        .insert({
          user_id: createdUser.id,
          email: newEmail.trim(),
          name: newName.trim() || newEmail.trim(),
          role: newRole || "inspector",
          site_access,
          is_banned: false,
        });

      if (profileErr) throw profileErr;

      // 3) Reload users so new user appears in table
      await loadUsers();

      // Reset form
      setNewEmail("");
      setNewName("");
      setNewPin("");
      setNewRole("inspector");
      setNewSiteIds([]);

      alert("User created.");
    } catch (e: any) {
      console.error("handleCreateSingleUser error", e);
      setError(e?.message || "Could not create user.");
    } finally {
      setCreatingSingle(false);
    }
  };

  // --------------------------
  // Bulk create users from CSV
  // --------------------------
  /**
   * CSV format (example):
   * email,pin,name,role,sites
   * jane@example.com,1234,Jane Smith,manager,Site A|Site B
   * bob@example.com,9999,Bob Jones,inspector,Site A
   *
   * "sites" is a list of site names separated by | that must match your site names.
   */
  const handleBulkCreate = async () => {
    if (!bulkCsv.trim()) {
      alert("Paste some CSV first.");
      return;
    }

    setCreatingBulk(true);
    setBulkResult(null);
    setError(null);

    try {
      const lines = bulkCsv
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length <= 1) {
        throw new Error("Please include a header row and at least one data row.");
      }

      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const idxEmail = header.indexOf("email");
      const idxPin = header.indexOf("pin");
      const idxName = header.indexOf("name");
      const idxRole = header.indexOf("role");
      const idxSites = header.indexOf("sites");

      if (idxEmail === -1 || idxPin === -1) {
        throw new Error("Header must include at least 'email' and 'pin'.");
      }

      let created = 0;
      let failed = 0;
      const failures: string[] = [];

      // Map site name -> id for convenience
      const siteNameToId = new Map<string, string>();
      for (const s of sites) {
        siteNameToId.set(s.name.toLowerCase(), s.id);
      }

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        const cols = row.split(",").map((c) => c.trim());
        const email = cols[idxEmail];
        const pin = cols[idxPin];
        const name = idxName >= 0 ? cols[idxName] : "";
        const roleRaw = idxRole >= 0 ? cols[idxRole] : "";
        const role: Role =
          roleRaw === "admin" || roleRaw === "manager" || roleRaw === "inspector"
            ? (roleRaw as Role)
            : "inspector";

        let siteIds: string[] = [];
        if (idxSites >= 0 && cols[idxSites]) {
          const siteNames = cols[idxSites].split("|").map((s) => s.trim());
          siteIds = siteNames
            .map((sn) => siteNameToId.get(sn.toLowerCase()))
            .filter((id): id is string => !!id);
        }

        if (!email || !pin) {
          failed++;
          failures.push(`Row ${i + 1}: missing email or pin`);
          continue;
        }

        try {
          const { data, error: signUpErr } = await supabase.auth.signUp({
            email,
            password: pin,
          });
          if (signUpErr) throw signUpErr;

          const createdUser = data.user;
          if (!createdUser) {
            throw new Error("No user returned");
          }

          const { error: profileErr } = await supabase
            .from("profiles")
            .insert({
              user_id: createdUser.id,
              email,
              name: name || email,
              role,
              site_access: role === "admin" ? null : siteIds,
              is_banned: false,
            });

          if (profileErr) throw profileErr;

          created++;
        } catch (e: any) {
          console.error(`bulk create row ${i + 1} error`, e);
          failed++;
          failures.push(`Row ${i + 1}: ${e?.message || "unknown error"}`);
        }
      }

      await loadUsers();

      let summary = `Created ${created} user(s).`;
      if (failed) {
        summary += ` Failed ${failed} row(s).`;
      }
      if (failures.length) {
        summary += "\n" + failures.join("\n");
      }
      setBulkResult(summary);
    } catch (e: any) {
      console.error("handleBulkCreate error", e);
      setError(e?.message || "Bulk create failed.");
    } finally {
      setCreatingBulk(false);
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
            Create users, assign roles and sites. Managers and inspectors only
            see templates and inspections for their assigned sites.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Create single user + bulk users */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Single user */}
        <div className="rounded-2xl border bg-white p-4 space-y-3 text-xs">
          <div className="font-semibold text-gray-800">
            Create single user
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Email
            </label>
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Name
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="Optional display name"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              PIN (used as password)
            </label>
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. 1234"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                Role
              </label>
              <select
                value={newRole || "inspector"}
                onChange={(e) =>
                  setNewRole(e.target.value as Role)
                }
                className="border rounded-xl px-3 py-2 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="inspector">Inspector</option>
              </select>
            </div>
          </div>
          {newRole !== "admin" && (
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                Sites for this user
              </label>
              <div className="flex flex-wrap gap-2">
                {sites.length === 0 ? (
                  <div className="text-[11px] text-gray-500">
                    No sites configured.
                  </div>
                ) : (
                  sites.map((s) => (
                    <label
                      key={s.id}
                      className="inline-flex items-center gap-1 border rounded-xl px-2 py-1 text-[11px] cursor-pointer bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={newSiteIds.includes(s.id)}
                        onChange={() => toggleNewUserSite(s.id)}
                      />
                      <span>{s.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
          <button
            onClick={handleCreateSingleUser}
            disabled={creatingSingle}
            className="w-full mt-2 px-3 py-2 rounded-xl bg-purple-700 text-white text-xs hover:bg-purple-800 disabled:opacity-50"
          >
            {creatingSingle ? "Creating user…" : "Create user"}
          </button>
          <p className="text-[10px] text-gray-400">
            The PIN is used as the initial password. Users can log in with
            email + PIN.
          </p>
        </div>

        {/* Bulk users */}
        <div className="rounded-2xl border bg-white p-4 space-y-3 text-xs">
          <div className="font-semibold text-gray-800">
            Bulk create users (CSV)
          </div>
          <p className="text-[11px] text-gray-500">
            Paste CSV with columns: <code>email,pin,name,role,sites</code>.
            Sites should match your site names and be separated by <code>|</code>.
          </p>
          <textarea
            value={bulkCsv}
            onChange={(e) => setBulkCsv(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-xs min-h-[120px]"
            placeholder={`email,pin,name,role,sites
jane@example.com,1234,Jane Smith,manager,Site A|Site B
bob@example.com,9999,Bob Jones,inspector,Site A`}
          />
          <button
            onClick={handleBulkCreate}
            disabled={creatingBulk}
            className="w-full px-3 py-2 rounded-xl bg-purple-700 text-white text-xs hover:bg-purple-800 disabled:opacity-50"
          >
            {creatingBulk ? "Creating users…" : "Bulk create users"}
          </button>
          {bulkResult && (
            <pre className="mt-2 text-[10px] text-gray-600 whitespace-pre-wrap bg-gray-50 border rounded-xl p-2">
              {bulkResult}
            </pre>
          )}
        </div>
      </div>

      {/* Existing users table */}
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