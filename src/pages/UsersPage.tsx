import React, { useEffect, useState } from "react";
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
        // user_id stays null – will be filled later by SQL script
      }));

      const { error } = await supabase
        .from("profiles")
        // onConflict: email (if you set a unique index on email)
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
        "Profiles imported / updated. Now run the SQL script in Supabase to create the Auth users with PIN passwords."
      );
    } catch (err: any) {
      console.error(err);
      setCsvError("Unexpected error importing CSV.");
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <AdminGuard>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-purple-700">Users & Bulk Import</h1>

        {/* Bulk Import Panel */}
        <div className="rounded-2xl bg-white border p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Bulk Import Users via CSV
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            Upload a CSV to quickly create or update many users at once. This fills the{" "}
            <code className="bg-gray-100 px-1 rounded">profiles</code> table. Then run
            the SQL script below in Supabase to create matching Auth users (password =
            PIN) so they can log in.
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
                <span className="font-semibold">pin_code</span> – required (this will
                also be the login password)
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

          {/* Helper SQL snippet */}
          <div className="border rounded-xl p-3 bg-white space-y-2 text-xs">
            <div className="font-semibold text-gray-700">
              2️⃣ Run this SQL once in Supabase to create Auth users from profiles
            </div>
            <p className="text-gray-600">
              After importing profiles, run this in{" "}
              <span className="font-mono">SQL Editor</span> to create auth users
              with passwords = their PIN (for PIN login & switch user):
            </p>
            <pre className="bg-gray-100 rounded-xl p-2 overflow-auto text-[10px]">
{`DO $$
DECLARE
  r RECORD;
  new_user UUID;
BEGIN
  FOR r IN
    SELECT *
    FROM profiles
    WHERE user_id IS NULL
      AND email IS NOT NULL
      AND pin_code IS NOT NULL
  LOOP
    INSERT INTO auth.users (email, encrypted_password)
    VALUES (
      r.email,
      crypt(r.pin_code, gen_salt('bf'))
    )
    RETURNING id INTO new_user;

    UPDATE profiles
    SET user_id = new_user
    WHERE email = r.email;
  END LOOP;
END $$;`}
            </pre>
          </div>
        </div>

        {/* Existing users list */}
        <div className="rounded-2xl bg-white border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Existing Users</h2>
            <button
              onClick={loadProfiles}
              className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {loading && <div className="text-xs text-gray-500">Loading users…</div>}
          {errorText && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {errorText}
            </div>
          )}

          {!loading && !profiles.length && !errorText && (
            <div className="text-xs text-gray-600">
              No profiles yet. Import via CSV above or create users in Supabase.
            </div>
          )}

          {profiles.length > 0 && (
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
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-1 pr-2">{p.email}</td>
                      <td className="py-1 pr-2">{p.name || "—"}</td>
                      <td className="py-1 pr-2">{p.role || "inspector"}</td>
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