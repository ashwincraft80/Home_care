"use server";

import { redirect } from "next/navigation";
import { withActor, str } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { addUnit, createProperty, removeUnit, updateProperty } from "./service";

const fields = (fd: FormData) => ({ name: str(fd, "name"), propertyType: str(fd, "propertyType"), line1: str(fd, "line1"), pincode: str(fd, "pincode") });

export async function createPropertyAction(_prev: ActionResult<{ id: string }> | null, fd: FormData) {
  const res = await withActor(({ actor, db }) => createProperty(db, actor, fields(fd)));
  if (res.ok) redirect(`/pm/properties/${res.data.id}`);
  return res;
}

export async function updatePropertyAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => updateProperty(db, actor, str(fd, "propertyId"), fields(fd)), { success: "Saved." });
}

export async function addUnitAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => addUnit(db, actor, { propertyId: str(fd, "propertyId"), label: str(fd, "label"), notes: str(fd, "notes") }), { success: "Unit added." });
}

export async function removeUnitAction(_prev: ActionResult | null, fd: FormData) {
  return withActor(({ actor, db }) => removeUnit(db, actor, str(fd, "unitId")), { success: "Unit removed." });
}
