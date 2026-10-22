import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { dictionaries, type Dictionary, type Locale } from "./dictionaries";

export const LOCALE_COOKIE = "hc_locale";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return value === "hi" ? "hi" : "en";
});

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}
