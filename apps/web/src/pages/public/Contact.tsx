import { useState } from "react";
import { Mail, MessageSquare } from "lucide-react";

export default function Contact() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // No backend mailer exists yet — this is intentionally a client-side
    // acknowledgement rather than a fake "sent" API call.
    setSent(true);
  }

  return (
    <div className="px-6 py-16">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Get in touch</h1>
          <p className="mt-3 text-slate-500">Questions about plans, features, or hosting your project on CloudN.</p>
        </div>

        {sent ? (
          <div className="card p-6 text-center">
            <MessageSquare className="mx-auto mb-3 text-accent-400" size={28} />
            <h2 className="text-base font-semibold text-white">Thanks for reaching out</h2>
            <p className="mt-1 text-sm text-slate-500">We'll get back to you as soon as possible.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <div>
              <label className="label">Name</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Message</label>
              <textarea
                className="input min-h-[120px] resize-none"
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>
            <button className="btn-primary w-full">Send Message</button>
          </form>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Mail size={14} /> hello@cloudn.example
        </div>
      </div>
    </div>
  );
}
