import React, { useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useNavigate } from "react-router-dom";

type Props = {
  onClose: () => void;
};

export default function SwitchUserModal({ onClose }: Props) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const signInWithPin = async () => {
    if (!pin.trim()) {
      alert("Enter a PIN.");
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
        alert("Invalid PIN.");
        setLoading(false);
        return;
      }

      const email = profile.email as string | undefined;
      if (!email) {
        alert("No email stored for this PIN in profiles.");
        setLoading(false);
        return;
      }

      // 2. Sign out current user
      await supabase.auth.signOut();

      // 3. Sign in with email + PIN (password = PIN)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: pin,
      });

      if (signInError) {
        console.error(signInError);
        alert(
          "Could not sign in with this PIN. Make sure the Supabase password matches the PIN."
        );
        setLoading(false);
        return;
      }

      onClose();
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Could not switch user via PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm space-y-4">
        <h2 className="text-lg font-bold text-purple-700">Switch User</h2>

        <p className="text-xs text-gray-500">
          Enter another user&apos;s PIN to switch accounts quickly.
        </p>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter PIN"
          className="w-full border rounded-xl px-3 py-2 text-sm"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl border text-xs hover:bg-gray-100"
          >
            Cancel
          </button>

          <button
            onClick={signInWithPin}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-purple-700 text-white text-xs hover:bg-purple-800 disabled:opacity-50"
          >
            {loading ? "Switching…" : "Switch User"}
          </button>
        </div>
      </div>
    </div>
  );
}