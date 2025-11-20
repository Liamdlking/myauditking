import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/utils/supabaseClient";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  // If already logged in, go straight to dashboard
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        navigate("/");
      }
    };
    checkSession();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!pin.trim()) {
      setErrorMsg("Please enter your PIN.");
      return;
    }

    setLoading(true);
    try {
      // 1. Look up profile by pin_code
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("email, pin_code")
        .eq("pin_code", pin)
        .maybeSingle();

      if (error || !profile) {
        setErrorMsg("Invalid PIN.");
        setLoading(false);
        return;
      }

      const email = profile.email as string | undefined;
      if (!email) {
        setErrorMsg("No email stored for this PIN. Check profiles table.");
        setLoading(false);
        return;
      }

      // 2. Login using email + PIN (password = PIN)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: pin,
      });

      if (signInError) {
        console.error(signInError);
        setErrorMsg("Could not sign in with this PIN. Check Supabase user password.");
        setLoading(false);
        return;
      }

      // Success → dashboard
      navigate("/");
    } catch (err) {
      console.error(err);
      setErrorMsg("Unexpected error logging in with PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-700 via-purple-800 to-indigo-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/95 rounded-2xl shadow-2xl p-6 space-y-5">
        {/* Logo + heading */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-yellow-400 to-yellow-500 flex items-center justify-center shadow">
              <span className="text-purple-900 font-extrabold text-lg">AK</span>
            </div>
            <span className="text-xl font-extrabold text-purple-800 tracking-tight">
              Audit <span className="text-yellow-500">King</span>
            </span>
          </div>
          <p className="text-xs text-gray-500">
            PIN-only quick login for inspectors, managers and admins
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter your PIN"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {errorMsg && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-purple-700 text-white py-2 text-sm font-medium hover:bg-purple-800 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in with PIN"}
          </button>
        </form>

        <div className="text-[10px] text-gray-400 text-center">
          Users and PINs are created by admins in the Audit King admin area / Supabase.
        </div>
      </div>
    </div>
  );
}