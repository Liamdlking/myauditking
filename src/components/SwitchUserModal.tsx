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
    if (!pin) return alert("Enter a PIN.");

    setLoading(true);

    try {
      // 1. Look up user by PIN
      const { data: userRow, error } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("pin_code", pin)
        .single();

      if (error || !userRow) {
        alert("Invalid PIN.");
        setLoading(false);
        return;
      }

      const userId = userRow.user_id;

      // 2. Fetch email from auth.users
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(
        userId
      );

      if (authError || !authUser?.user?.email) {
        alert("User account not found.");
        setLoading(false);
        return;
      }

      const email = authUser.user.email;

      // 3. Log out current user
      await supabase.auth.signOut();

      // 4. Log in using "magic" tokenless trick
      //    Using OTP-less login via Supabase: generate a one-time token
      const { data: sessionData, error: sessionError } =
        await supabase.auth.signInWithPassword({
          email,
          password: pin, // using PIN as password surrogate
        });

      if (sessionError) {
        alert("Could not sign in with PIN.");
        setLoading(false);
        return;
      }

      onClose();
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Could not switch user.");
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm space-y-4">
        <h2 className="text-lg font-bold text-purple-700">Switch User</h2>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter PIN"
          className="w-full border rounded-xl px-3 py-2"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl border hover:bg-gray-100"
          >
            Cancel
          </button>

          <button
            onClick={signInWithPin}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50"
          >
            {loading ? "Switching…" : "Switch User"}
          </button>
        </div>
      </div>
    </div>
  );
}