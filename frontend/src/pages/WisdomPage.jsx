import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWisdom, submitWisdom } from "../utils/api.js";

export default function WisdomPage() {
  const [form, setForm] = useState({ contributor_name: "", contributor_age: "", ward_number: "", category: "general", wisdom_text: "" });
  const [items, setItems] = useState([]);

  const load = async () => {
    const res = await getWisdom(form.ward_number || undefined);
    setItems(res.items || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    await submitWisdom({ ...form, contributor_age: Number(form.contributor_age || 0) || null });
    setForm({ contributor_name: "", contributor_age: "", ward_number: "", category: "general", wisdom_text: "" });
    load();
  };

  return (
    <div className="w-full h-[100dvh] overflow-y-auto bg-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-navy-900 to-navy-950" />
      <div className="relative mx-auto max-w-[900px] px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Community Wisdom</h1>
          <Link to="/" className="rounded-xl border border-white/10 bg-navy-800/60 hover:bg-navy-800/90 px-3 py-2 text-sm text-white">Back</Link>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-navy-800/60 p-4">
          <input className="bg-navy-900/40 border border-white/10 rounded-xl px-3 py-2" placeholder="Name" value={form.contributor_name} onChange={(e) => setForm({ ...form, contributor_name: e.target.value })} required />
          <input className="bg-navy-900/40 border border-white/10 rounded-xl px-3 py-2" placeholder="Age" value={form.contributor_age} onChange={(e) => setForm({ ...form, contributor_age: e.target.value })} />
          <input className="bg-navy-900/40 border border-white/10 rounded-xl px-3 py-2" placeholder="Ward" value={form.ward_number} onChange={(e) => setForm({ ...form, ward_number: e.target.value })} />
          <select className="bg-navy-900/40 border border-white/10 rounded-xl px-3 py-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="general">General</option><option value="water">Water</option><option value="sanitation">Sanitation</option><option value="services">Services</option>
          </select>
          <textarea className="md:col-span-2 bg-navy-900/40 border border-white/10 rounded-xl px-3 py-2" rows={4} placeholder="Your local knowledge" value={form.wisdom_text} onChange={(e) => setForm({ ...form, wisdom_text: e.target.value })} required />
          <button className="md:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Submit</button>
        </form>

        <div className="mt-6 space-y-2">
          {items.map((x) => (
            <div key={x.id} className="rounded-xl border border-white/10 bg-navy-800/50 px-3 py-2">
              <div className="text-xs text-slateInk-400">Ward {x.ward_number} · {x.category}</div>
              <div className="text-sm">{x.wisdom_text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
