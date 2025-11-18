import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type Role = "admin" | "manager" | "inspector" | string | null;

type QuestionType = "yes_no_na" | "good_fair_poor" | "multiple_choice" | "text";

type TemplateQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  options?: string[]; // for multiple_choice
  allowNotes: boolean;
  allowPhoto: boolean;
  required: boolean;
};

type TemplateSection = {
  id: string;
  title: string;
  image_data_url?: string | null;
  questions: TemplateQuestion[];
};

type TemplateDefinition = {
  sections: TemplateSection[];
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  site: string | null;
  updated_at: string | null;
  definition: TemplateDefinition | null;
  logo_data_url: string | null;
};

function uuid() {
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<Role>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSite, setFormSite] = useState("");
  const [formLogoDataUrl, setFormLogoDataUrl] = useState<string | null>(null);
  const [formSections, setFormSections] = useState<TemplateSection[]>([]);

  // ------------------------------
  // Load current user's role
  // ------------------------------
  useEffect(() => {
    const loadRole = async () => {
      setRoleLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
          setRole(null);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (!error && data) {
          setRole((data.role as Role) || "inspector");
        } else {
          setRole("inspector");
        }
      } catch {
        setRole("inspector");
      } finally {
        setRoleLoading(false);
      }
    };

    loadRole();
  }, []);

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isInspector = role === "inspector" || !role;

  // ------------------------------
  // Load templates list
  // ------------------------------
  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("templates")
        .select(
          "id, name, description, site, updated_at, definition, logo_data_url"
        )
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((t: any) => {
        const def: TemplateDefinition =
          (t.definition as TemplateDefinition) || { sections: [] };
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          site: t.site,
          updated_at: t.updated_at,
          logo_data_url: t.logo_data_url || null,
          definition:
            def && Array.isArray(def.sections)
              ? def
              : { sections: [] },
        } as TemplateRow;
      });

      setTemplates(mapped);
    } catch (e: any) {
      console.error("loadTemplates error", e);
      setError(
        e?.message || "Could not load templates. Check Supabase settings."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // ------------------------------
  // Start inspection from template (simple hook)
  // ------------------------------
  const startInspection = async (tpl: TemplateRow) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        alert("You must be logged in to start an inspection.");
        return;
      }

      const payload = {
        template_id: tpl.id,
        template_name: tpl.name,
        site: tpl.site,
        status: "in_progress",
        started_at: new Date().toISOString(),
        submitted_at: null,
        score: null,
        items: [], // your InspectionsPage builds items as needed
        owner_user_id: user.id,
        owner_name: user.email ?? "Unknown",
      };

      const { error } = await supabase.from("inspections").insert([payload]);
      if (error) throw error;

      alert(
        "Inspection started. You can continue it from the Inspections page."
      );
    } catch (e: any) {
      console.error("startInspection error", e);
      alert(
        e?.message ||
          "Could not start inspection. Check the inspections table schema."
      );
    }
  };

  // ------------------------------
  // Open create/edit modal
  // ------------------------------
  const openCreate = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    setFormSite("");
    setFormLogoDataUrl(null);
    setFormSections([]);
  };

  const openEdit = (tpl: TemplateRow) => {
    setIsCreating(false);
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormDescription(tpl.description || "");
    setFormSite(tpl.site || "");
    setFormLogoDataUrl(tpl.logo_data_url || null);

    const def: TemplateDefinition =
      tpl.definition || { sections: [] };
    setFormSections(def.sections || []);
  };

  const closeModal = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setFormName("");
    setFormDescription("");
    setFormSite("");
    setFormLogoDataUrl(null);
    setFormSections([]);
  };

  // ------------------------------
  // Logo upload
  // ------------------------------
  const handleLogoFile = (file: File | null) => {
    if (!file) {
      setFormLogoDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFormLogoDataUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  // ------------------------------
  // Section helpers
  // ------------------------------
  const addSection = () => {
    setFormSections((prev) => [
      ...prev,
      {
        id: uuid(),
        title: "New section",
        image_data_url: null,
        questions: [],
      },
    ]);
  };

  const updateSection = (id: string, patch: Partial<TemplateSection>) => {
    setFormSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const deleteSection = (id: string) => {
    setFormSections((prev) => prev.filter((s) => s.id !== id));
  };

  const moveSection = (id: string, direction: "up" | "down") => {
    setFormSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      if (direction === "up" && idx === 0) return prev;
      if (direction === "down" && idx === prev.length - 1) return prev;
      const newArr = [...prev];
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      const tmp = newArr[idx];
      newArr[idx] = newArr[swapWith];
      newArr[swapWith] = tmp;
      return newArr;
    });
  };

  const handleSectionImageFile = (sectionId: string, file: File | null) => {
    if (!file) {
      updateSection(sectionId, { image_data_url: null });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateSection(sectionId, { image_data_url: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  // ------------------------------
  // Question helpers
  // ------------------------------
  const addQuestionToSection = (sectionId: string) => {
    setFormSections((prev) =>
      prev.map((s) =>
        s.id ===