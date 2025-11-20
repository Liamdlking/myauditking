import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import AdminGuard from "@/components/AdminGuard";

type ProfileRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  pin_code: string | null;
  site_access: string[] | null;
  is_banned: boolean;
};

type CsvUser = {
  email: string;
  name: string;
  role: string;
  pin_code: string;
  site_access: string[];
};

export default function UsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [csvPreview, setCsvPreview] = useState<CsvUser[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  const [roleFilter, setRoleFilter] = useState<"all" | "inspector" | "manager" | "admin">(
    "all"
  );
  const [siteFilter, setSiteFilter] = useState<string>("");

  const [busyUserId, setBusyUserId] = useState<string | null>(null); // per-row actions

  // Single user create form state
  const [singleEmail, setSingleEmail] = useState("");
  const [singleName, setSingleName] = useState("");
  const [singleRole, setSingleRole] = useState<"inspector" | "manager" | "admin">(
    "inspector"
  );
  const [singlePin, setSinglePin] = useState("");
  const [singleSites, setSingleSites] = useState("");
  const [singleBusy, setSingleBusy] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // ---------------------------------------------
  // Load existing profiles
  // ---------------------------------------------
  const loadProfiles = async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,name,role,pin_code,site_access,is_banned")
        .order("email", { ascending: true });

      if (error) {
        console.error(error);
        setErrorText(error.message || "Could not load users.");
      } else {
        setProfiles((data || []) as ProfileRow[]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorText("Unexpected error loading users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  // ---------------------------------------------
  // Derived site options for filter
  // ---------------------------------------------
  const allSites = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => {
      (p.site_access || []).forEach((s) => {
        if (s) set.add(s);
      });
    });
    return Array.from(set).sort();
  }, [profiles]);

  // ---------------------------------------------
  // Filtered profiles for display
  // ---------------------------------------------
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const matchesRole = roleFilter === "all" || (p.role || "inspector") === roleFilter;
      const matchesSite =
        !siteFilter ||
        (p.site_access || []).some((s) => s === siteFilter);
      return matchesRole && matchesSite;
    });
  }, [profiles, roleFilter, siteFilter]);

  // ---------------------------------------------
  // Single user create
  // ---------------------------------------------
  const handleCreateSingleUser = async () => {
    setSingleError(null);

    const email = singleEmail.trim();
    const pin = singlePin.trim();
    const name = singleName.trim();
    const role = singleRole;
    const sitesRaw = singleSites.trim();

    if (!email || !pin) {
      setSingleError("Email and PIN are required.");
      return;
    }

    const site_access =
      sitesRaw.length > 0
        ? sitesRaw
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    setSingleBusy(true);

    try {
      // 1) Create Supabase Auth user with email + password = PIN
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: pin,
      });

      if (authError) {
        console.error(authError);
        setSingleError(authError.message || "Could not create auth user.");
        setSingleBusy(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        setSingleError("User created but no ID returned from Supabase.");
        setSingleBusy(false);
        return;
      }

      // 2) Insert / upsert profile row
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          user_id: userId,
          email,
          name: name || email,
          role,
          pin_code: pin,
          site_access,
          is_banned: false,
        } as any,
        {
          onConflict: "user_id",
        }
      );

      if (profileError) {
        console.error(profileError);
        setSingleError(profileError.message || "Could not create profile row.");
        setSingleBusy(false);
        return;
      }

      // Clear form and refresh list
      setSingleEmail("");
      setSingleName("");
      setSinglePin("");
      setSingleSites("");
      setSingleRole("inspector");
      await loadProfiles();
      alert("User created successfully.");
    } catch (err: any) {
      console.error(err);
      setSingleError("Unexpected error creating user.");
    } finally {
      setSingleBusy(false);
    }
  };

  // ---------------------------------------------
  // CSV parsing (email,name,role,pin_code,sites)
  // sites: site-a|site-b
  // ---------------------------------------------
  const handleCsvFile = (file: File) => {
    setCsvError(null);
    setCsvPreview(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "").trim();
        if (!text) {
          setCsvError("File is empty.");
          return;
        }

        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          setCsvError("File must have a header row and at least one user row.");
          return;
        }

        const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const idxEmail = header.indexOf("email");
        const idxName = header.indexOf("name");
        const idxRole = header.indexOf("role");
        const idxPin = header.indexOf("pin_code");
        const idxSites = header.indexOf("sites");

        if (idxEmail === -1 || idxPin === -1) {
          setCsvError(
            "Header must include at least: email,pin_code. Optional: name,role,sites"
          );
          return;
        }

        const preview: CsvUser[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const cols = line.split(",").map((c) => c.trim());

          const email = cols[idxEmail] || "";
          const pin_code = cols[idxPin] || "";
          const name = idxName !== -1 ? cols[idxName] || "" : "";
          const role = idxRole !== -1 ? cols[idxRole] || "inspector" : "inspector";
          const sitesCell = idxSites !== -1 ? cols[idxSites] || "" : "";
          const site_access =
            sitesCell
              ?.split("|")
              .map((s) => s.trim())
              .filter(Boolean) ?? [];

          if (!email || !pin_code) {
            continue; // skip broken rows quietly
          }

          preview.push({
            email,
            name,
            role,
            pin_code,
            site_access,
          });
        }

        if (!preview.length) {
          setCsvError("No valid rows found. Check your CSV formatting.");
          return;
        }

        setCsvPreview(preview);
      } catch (err: any) {
        console.error(err);
        setCsvError("Could not parse CSV file.");
      }
    };

    reader.onerror = () => {
      setCsvError("Could not read file.");
    };

    reader.readAsText(file);
  };

  // ---------------------------------------------
  // Import CSV into profiles table
  // ---------------------------------------------
  const importCsv = async () => {
    if (!csvPreview || !csvPreview.length) return;

    setCsvImporting(true);
    setCsvError(null);

    try {
      const payload = csvPreview.map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role || "inspector",
        pin_code: u.pin_code,
        site_access: u.site_access,
        // user_id stays null – can be filled later with SQL if you still use that flow
      }));

      const { error } = await supabase
        .from("profiles")
        .upsert(payload as any, {
          onConflict: "email",
        });

      if (error) {
        console.error(error);
        setCsvError(
          error.message || "Supabase error importing CSV into profiles table."
        );
        return;
      }

      setCsvPreview(null);
      await loadProfiles();
      alert(
        "Profiles imported / updated. You can either keep using the SQL method to bind auth users, or move to the single-user form which creates auth + profile in one step."
      );
    } catch (err: any) {
      console.error(err);
      setCsvError("Unexpected error importing CSV.");
    } finally {
      setCsvImporting(false);
    }
  };

  // ---------------------------------------------
  // Export helpers
  // ---------------------------------------------
  const makeCsvFromProfiles = (rows: ProfileRow[]): string => {
    const header = ["email", "name", "role", "pin_code", "sites"].join(",");
    const lines = rows.map((p) => {
      const sites = (p.site_access || []).join("|");
      const safe = (v: string | null | undefined) =>
        (v ?? "").replace(/"/g, '""'); // basic escaping

      return [
        `"${safe(p.email)}"`,
        `"${safe(p.name || "")}"`,
        `"${safe(p.role || "inspector")}"`,
        `"${safe(p.pin_code || "")}"`,
        `"${safe(sites)}"`,
      ].join(",");
    });
    return [header, ...lines].join("\n");
  };

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportAllCsv = () => {
    if (!profiles.length) {
      alert("No users to export.");
      return;
    }
    const csv = makeCsvFromProfiles(profiles);
    downloadCsv(csv, "users-all-export.csv");
  };

  const exportFilteredCsv = () => {
    if (!filteredProfiles.length) {
      alert("No users match the current filters.");
      return;
    }
    const csv = makeCsvFromProfiles(filteredProfiles);
    downloadCsv(csv, "users-filtered-export.csv");
  };

  // ---------------------------------------------
  // Inline actions: role change, ban/unban, impersonate
  // ---------------------------------------------
  const updateRole = async (p: ProfileRow, newRole: string) => {
    setBusyUserId(p.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", p.id);

      if (error) {
        console.error(error);
        alert(error.message || "Could not update role.");
        return;
      }

      setProfiles((prev) =>
        prev.map((row) =>
          row.id === p.id ? { ...row, role: newRole } : row
        )
      );
    } catch (err: any) {
      console.error(err);
      alert("Unexpected error updating role.");
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleBan = async (p: ProfileRow) => {
    const next = !p.is_banned;
    const label = next ? "ban" : "unban";
    if (!window.confirm(`Are you sure you want to ${label} ${p.email}?`)) return;

    setBusyUserId(p.id);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_banned: next })
        .eq("id", p.id);

      if (error) {
        console.error(error);
        alert(error.message || "Could not update ban status.");
        return;
      }

      setProfiles((prev) =>
        prev.map((row) =>
          row.id === p.id ? { ...row, is_banned: next } : row
        )
      );
    } catch (err: any) {
      console.error(err);
      alert("Unexpected error updating ban status.");
    } finally {
      setBusyUserId(null);
    }
  };

  const impersonateUser = async (p: ProfileRow) => {
    if (!p.email || !p.pin_code) {
      alert("Cannot impersonate: user is missing email or pin_code.");
      return;
    }

    const ok = window.confirm(
      `This will sign you out and sign in as ${p.email}. Continue?`
    );
    if (!ok) return;

    setBusyUserId(p.id);
    try {
      await supabase.auth.signOut();

      const { error } = await supabase.auth.signInWithPassword({
        email: p.email,
        password: p.pin_code,
      });

      if (error) {
        console.error(error);
        alert(
          error.message ||
            "Could not impersonate user. Check that their Supabase password matches their PIN."
        );
        return;
      }

      window.location.href = "/";
    } catch (err: any) {
      console.error(err);
      alert("Unexpected error while impersonating user.");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <AdminGuard>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-purple-700">Users & Bulk Import</h1>

        {/* Single user create panel */}
        <div className="rounded-2xl bg-white border p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Create Single User</h2>
          <p className="text-xs text-gray-600">
            Use this for one-off users. This will create a Supabase auth user and a
            matching profile. The{" "}
            <span className="font-semibold">PIN is also the login password</span> for
            that user.
          </p>
          <div className="grid gap-3 md:grid-cols-5 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Email *</label>
              <input
                type="email"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
                placeholder="worker@company.com"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
                placeholder="Worker Name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Role</label>
              <select
                value={singleRole}
                onChange={(e) =>
                  setSingleRole(e.target.value as "inspector" | "manager" | "admin")
                }
                className="w-full border rounded-xl px-3 py-2 text-sm"
              >
                <option value="inspector">Inspector</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4 items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-1">PIN *</label>
              <input
                type="text"
                value={singlePin}
                onChange={(e) => setSinglePin(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
                placeholder="1234"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">
                Sites (optional, use <code>|</code> to separate)
              </label>
              <input
                type="text"
                value={singleSites}
                onChange={(e) => setSingleSites(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm"
                placeholder="site-a|site-b"
              />
            </div>
            <div className="text-right">
              <button
                onClick={handleCreateSingleUser}
                disabled={singleBusy}
                className="px-4 py-2 rounded-xl bg-purple-700 text-white text-sm hover:bg-purple-800 disabled:opacity-50"
              >
                {singleBusy ? "Creating…" : "Create user"}
              </button>
            </div>
          </div>
          {singleError && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {singleError}
            </div>
          )}
        </div>

        {/* Bulk Import Panel */}
        <div className="rounded-2xl bg-white border p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Bulk Import Users via CSV
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            Upload a CSV to quickly create or update many users at once. This fills the{" "}
            <code className="bg-gray-100 px-1 rounded">profiles</code> table. You can
            still use the SQL method to bind auth users, or move entirely to the single
            user form which creates auth + profile in one go.
          </p>

          <div className="space-y-2 text-xs">
            <div className="font-semibold">CSV format (header row required):</div>
            <pre className="bg-gray-100 rounded-xl p-2 overflow-auto text-[11px]">
{`email,name,role,pin_code,sites
worker1@company.com,Worker One,inspector,1111,site-a
worker2@company.com,Worker Two,manager,2222,site-a|site-b
worker3@company.com,Worker Three,admin,3333,site-b`}
            </pre>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <span className="font-semibold">email</span> – required
              </li>
              <li>
                <span className="font-semibold">pin_code</span> – required (usually the
                login PIN/password)
              </li>
              <li>
                <span className="font-semibold">role</span> – optional (defaults to{" "}
                <code>inspector</code>)
              </li>
              <li>
                <span className="font-semibold">sites</span> – optional, use{" "}
                <code>|</code> to separate multiple sites (e.g.{" "}
                <code>site-a|site-b</code>)
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-gray-50 text-xs cursor-pointer hover:bg-gray-100">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvFile(file);
                }}
              />
              Choose CSV file…
            </label>
            {csvPreview && (
              <span className="text-xs text-gray-600">
                Parsed {csvPreview.length} user(s) from CSV.
              </span>
            )}
          </div>

          {csvError && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {csvError}
            </div>
          )}

          {csvPreview && (
            <div className="border rounded-xl p-3 bg-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-700">
                  Preview ({csvPreview.length} users)
                </div>
                <button
                  onClick={importCsv}
                  disabled={csvImporting}
                  className="px-3 py-1 rounded-xl bg-purple-700 text-white text-xs hover:bg-purple-800 disabled:opacity-50"
                >
                  {csvImporting ? "Importing…" : "Import into profiles"}
                </button>
              </div>
              <div className="max-h-48 overflow-auto text-xs">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1 pr-2 font-semibold">Email</th>
                      <th className="py-1 pr-2 font-semibold">Name</th>
                      <th className="py-1 pr-2 font-semibold">Role</th>
                      <th className="py-1 pr-2 font-semibold">PIN</th>
                      <th className="py-1 pr-2 font-semibold">Sites</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((u, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-1 pr-2">{u.email}</td>
                        <td className="py-1 pr-2">{u.name}</td>
                        <td className="py-1 pr-2">{u.role}</td>
                        <td className="py-1 pr-2">{u.pin_code}</td>
                        <td className="py-1 pr-2">
                          {u.site_access && u.site_access.length
                            ? u.site_access.join(", ")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-[11px] text-gray-500">
                Existing profiles with the same email will be updated. New emails will
                be inserted.
              </div>
            </div>
          )}
        </div>

        {/* Existing users list + filters + actions */}
        <div className="rounded-2xl bg-white border p-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Existing Users</h2>
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <div className="flex items-center gap-1">
                <span className="text-gray-600">Role:</span>
                <select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(
                      e.target.value as "all" | "inspector" | "manager" | "admin"
                    )
                  }
                  className="border rounded-xl px-2 py-1 text-xs"
                >
                  <option value="all">All</option>
                  <option value="inspector">Inspector</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600">Site:</span>
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="border rounded-xl px-2 py-1 text-xs"
                >
                  <option value="">All sites</option>
                  {allSites.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={exportAllCsv}
                className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
              >
                Export all (CSV)
              </button>
              <button
                onClick={exportFilteredCsv}
                className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
              >
                Export filtered (CSV)
              </button>
              <button
                onClick={loadProfiles}
                className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
          </div>

          {loading && <div className="text-xs text-gray-500">Loading users…</div>}
          {errorText && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {errorText}
            </div>
          )}

          {!loading && !filteredProfiles.length && !errorText && (
            <div className="text-xs text-gray-600">
              No profiles match the current filters.
            </div>
          )}

          {filteredProfiles.length > 0 && (
            <div className="overflow-auto max-h-80 text-xs">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 pr-2">Email</th>
                    <th className="py-1 pr-2">Name</th>
                    <th className="py-1 pr-2">Role</th>
                    <th className="py-1 pr-2">PIN</th>
                    <th className="py-1 pr-2">Sites</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1 pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-1 pr-2">{p.email}</td>
                      <td className="py-1 pr-2">{p.name || "—"}</td>
                      <td className="py-1 pr-2">
                        <select
                          value={p.role || "inspector"}
                          onChange={(e) => updateRole(p, e.target.value)}
                          className="border rounded-xl px-2 py-1 text-[11px]"
                          disabled={busyUserId === p.id}
                        >
                          <option value="inspector">Inspector</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-1 pr-2">{p.pin_code || "—"}</td>
                      <td className="py-1 pr-2">
                        {p.site_access && p.site_access.length
                          ? p.site_access.join(", ")
                          : "—"}
                      </td>
                      <td className="py-1 pr-2">
                        {p.is_banned ? (
                          <span className="text-rose-600">Banned</span>
                        ) : (
                          <span className="text-emerald-600">Active</span>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => toggleBan(p)}
                            disabled={busyUserId === p.id}
                            className="px-2 py-1 rounded-xl border text-[10px] hover:bg-gray-50"
                          >
                            {p.is_banned ? "Unban" : "Ban"}
                          </button>
                          <button
                            onClick={() => impersonateUser(p)}
                            disabled={busyUserId === p.id}
                            className="px-2 py-1 rounded-xl border text-[10px] hover:bg-purple-50 text-purple-700"
                          >
                            Impersonate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}