"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "./server";

export async function setLocale(locale: string): Promise<void> {
  const value = locale === "hi" ? "hi" : "en";
  (await cookies()).set(LOCALE_COOKIE, value, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
