"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, getAccessCode, isAllowedName } from "@/lib/auth";

export type LoginState = { error: string | null };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const name = String(formData.get("fullName") || "").trim();
  const code = String(formData.get("code") || "").trim();

  if (!name) return { error: "Please enter your full name." };
  if (code !== getAccessCode()) return { error: "Invalid access code." };
  if (!isAllowedName(name)) {
    return { error: "This name is not authorized to access the portal." };
  }

  cookies().set(AUTH_COOKIE, encodeURIComponent(name), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });

  redirect("/dashboard");
}
