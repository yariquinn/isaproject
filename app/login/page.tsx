"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn login-submit" disabled={pending}>
      {pending ? "Unlocking…" : "Unlock Backend"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <main className="login-main">
      <div className="login-card">
        <div className="login-brand">
          Isa Abdur-Rahman, PLLC
          <span>Attorney Portal</span>
        </div>

        <button className="google-btn" type="button" disabled>
          <span className="g">G</span> Sign in with Google
        </button>
        <p className="login-note">
          Google sign-in and new sign-ups are disabled for this portal.
        </p>

        <div className="login-divider">
          <span>or enter access code</span>
        </div>

        <form action={formAction} className="login-form">
          <label>
            Full Name
            <input type="text" name="fullName" required autoComplete="name" />
          </label>
          <label>
            Access Code
            <input
              type="password"
              name="code"
              required
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          {state.error && <div className="login-error">{state.error}</div>}
          <SubmitButton />
        </form>

        <Link href="/" className="login-back">
          ← Back to website
        </Link>
      </div>
    </main>
  );
}
