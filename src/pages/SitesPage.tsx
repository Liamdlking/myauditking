import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type Site = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  created_at: string;
};

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setDescription("");
  };

  const loadSites = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sites")
      .select("id, name, code, description, created_at")
      .order("name", { ascending: true });

    if (error) {
      console.error("loadSites error", error);
      alert("Could not load sites.");
      setSites([]);
    } else {
      setSites((data || []) as Site[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSites();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Site name is required.");
      return;
    }

    if (editingId) {
      // update existing
      const { error } = await supabase
        .from("sites")
        .update({
          name: name.trim(),
          code: code.trim() || null,
          description: description.trim() || null,
        })
        .eq("id", editingId);

      if (error) {
        console.error("update site error", error);
        alert("Could not update site.");
        return;
      }
    } else {
      // create new
      const { error } = await supabase.from("sites").insert({
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
      });

      if (error) {
        console.error("create site error", error);
        alert("Could not create site.");
        return;
      }
    }

    resetForm();
    loadSites();
  };

  const startEdit = (site: Site) => {
    setEditingId(site.id);
    setName(site.name);
    setCode(site.code || "");
    setDescription(site.description || "");
  };

  const handleDelete = async (site: Site) => {
    if (
      !window.confirm(
        `Delete site "${site.name}"? This will not delete templates or inspections, but they may become unassigned.`
      )
    ) {
      return;
    }

    const { error } = await supabase.from("sites").delete().eq("id", site.id);
    if (error) {
      console.error("delete site error", error);
      alert("Could not delete site.");
      return;
    }
    loadSites();
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-royal-700">Sites</h1>
        <p className="text-sm text-gray-600">
          Manage your locations (sites) and link templates & inspections to
          them.
        </p>
      </div>

      {/* Create / edit form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border rounded-2xl p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-royal-700 text-sm">
            {editingId ? "Edit site" : "Create site"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-gray-500 hover:underline"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. Manchester DC"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Code</label>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="e.g. MAN"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Description
          </label>
          <textarea
            className="w-full border rounded-xl px-3 py-2 text-sm"
            placeholder="Optional description for this site."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
          >
            {editingId ? "Save changes" : "Create site"}
          </button>
        </div>
      </form>

      {/* Sites list */}
      <div className="bg-white border rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-700">All sites</h2>
          {loading && (
            <span className="text-xs text-gray-400">Loading sites…</span>
          )}
        </div>

        {sites.length === 0 && !loading && (
          <div className="text-sm text-gray-600">
            No sites yet. Create your first site above.
          </div>
        )}

        <div className="space-y-2">
          {sites.map((site) => (
            <div
              key={site.id}
              className="border rounded-xl px-3 py-2 text-sm flex justify-between items-center"
            >
              <div>
                <div className="font-semibold text-gray-800">{site.name}</div>
                <div className="text-xs text-gray-500">
                  {site.code && <span>Code: {site.code} • </span>}
                  Created:{" "}
                  {site.created_at
                    ? site.created_at.slice(0, 16).replace("T", " ")
                    : "—"}
                </div>
                {site.description && (
                  <div className="text-xs text-gray-600 mt-1">
                    {site.description}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(site)}
                  className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(site)}
                  className="px-3 py-1 rounded-xl border text-xs text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}