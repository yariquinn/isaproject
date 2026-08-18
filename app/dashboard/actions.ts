"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";

export async function logoutAction() {
  cookies().delete(AUTH_COOKIE);
  redirect("/login");
}
