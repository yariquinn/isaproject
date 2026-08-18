"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Status = "idle" | "submitting" | "success" | "error";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = new FormData(form);

    const { error } = await supabase.from("inquiries").insert({
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim() || null,
      message: String(data.get("message") || "").trim(),
    });

    if (error) {
      setStatus("error");
      setErrorMsg("Something went wrong. Please call or email us instead.");
      return;
    }

    form.reset();
    setStatus("success");
  }

  if (status === "success") {
    return (
      <div className="form-note success">
        Thank you &mdash; your message has been received. We&rsquo;ll be in touch
        shortly.
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input type="text" name="name" required autoComplete="name" />
      </label>
      <label>
        Email
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <label>
        Phone <span className="optional">(optional)</span>
        <input type="tel" name="phone" autoComplete="tel" />
      </label>
      <label>
        How can we help?
        <textarea name="message" rows={5} required />
      </label>
      <button type="submit" className="btn" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send Message"}
      </button>
      {status === "error" && (
        <div className="form-note error">{errorMsg}</div>
      )}
    </form>
  );
}
