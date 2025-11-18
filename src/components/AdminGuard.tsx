import React, { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useNavigate } from "react-router-dom";

/**
 * AdminGuard wraps pages that only admins can access.
 * If the logged-in user is not an admin, they get redirected.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        navigate("/login");
        return;
      }

      const userId = session.user.id;

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("AdminGuard profiles lookup failed", error);
        setAllowed(false);
        return;
      }

      if (data.role === "admin") setAllowed(true);
      else setAllowed(false);
    };

    check();
  }, []);

  if (allowed === null) {
    return (
      <div className="p-6 text-center text-gray-600">
        Checking permissions…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6 text-center text-rose-600">
        You are not authorised to view this page.
      </div>
    );
  }

  return <>{children}</>;
}