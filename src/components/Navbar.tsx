import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/utils/supabaseClient";
import SwitchUserModal from "./SwitchUserModal";

export default function Navbar() {
  const [switchOpen, setSwitchOpen] = useState(false);
  const navigate = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <>
      <nav className="bg-purple-700 text-white px-4 py-3 flex justify-between items-center shadow">
        <Link to="/" className="font-bold text-lg tracking-wide">
          Audit King
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link to="/templates" className="hover:underline">
            Templates
          </Link>
          <Link to="/inspections" className="hover:underline">
            Inspections
          </Link>
          <Link to="/sites" className="hover:underline">
            Sites
          </Link>
          <Link to="/users" className="hover:underline">
            Users
          </Link>

          {/* --- Switch User Button --- */}
          <button
            onClick={() => setSwitchOpen(true)}
            className="bg-white text-purple-700 px-3 py-1 rounded-xl hover:bg-gray-100"
          >
            Switch User
          </button>

          <button
            onClick={logout}
            className="border px-3 py-1 rounded-xl hover:bg-purple-800"
          >
            Logout
          </button>
        </div>
      </nav>

      {switchOpen && <SwitchUserModal onClose={() => setSwitchOpen(false)} />}
    </>
  );
}