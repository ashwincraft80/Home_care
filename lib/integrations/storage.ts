import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getDemoConfig, getSupabaseConfig, isDemoMode } from "@/lib/config/env";

/**
 * Private object storage. Files are only ever served through /api/files/[id], which checks
 * access with RLS first. Storage paths are random and never shown to users.
 */
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Returns bytes (local) or a short-lived signed URL (remote). */
  read(key: string): Promise<{ bytes: Uint8Array } | { url: string }>;
  remove(keys: string[]): Promise<void>;
}

function safeKey(key: string): string {
  if (!/^[a-z0-9/-]+\.(jpg|png|webp|pdf)$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
}

class LocalDiskStorage implements ObjectStorage {
  private root = getDemoConfig().uploadsDir;
  async put(key: string, bytes: Uint8Array) {
    const file = path.join(this.root, safeKey(key));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
  async read(key: string) {
    return { bytes: new Uint8Array(await fs.readFile(path.join(this.root, safeKey(key)))) };
  }
  async remove(keys: string[]) {
    await Promise.all(keys.map((k) => fs.rm(path.join(this.root, safeKey(k)), { force: true })));
  }
}

class SupabaseStorage implements ObjectStorage {
  private bucket = getSupabaseConfig().storageBucket;
  private async client() {
    const { createSupabaseServiceClient } = await import("@/lib/auth/supabase");
    return createSupabaseServiceClient().storage.from(this.bucket);
  }
  async put(key: string, bytes: Uint8Array, contentType: string) {
    const { error } = await (await this.client()).upload(safeKey(key), bytes, { contentType, upsert: false });
    if (error) throw error;
  }
  async read(key: string) {
    const { data, error } = await (await this.client()).createSignedUrl(safeKey(key), 60);
    if (error || !data) throw error ?? new Error("Could not sign URL");
    return { url: data.signedUrl };
  }
  async remove(keys: string[]) {
    if (keys.length) await (await this.client()).remove(keys.map(safeKey));
  }
}

let instance: ObjectStorage | null = null;
export function getStorage(): ObjectStorage {
  instance ??= isDemoMode() ? new LocalDiskStorage() : new SupabaseStorage();
  return instance;
}
