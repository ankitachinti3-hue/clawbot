import React from "react";
import AdminDashboard from "../components/AdminDashboard.jsx";

export default function AdminPage() {
  return (
    <div className="w-full h-[100dvh] bg-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-navy-900 to-navy-950" />
      <div className="relative h-full">
        <AdminDashboard />
      </div>
    </div>
  );
}

