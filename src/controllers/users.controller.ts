import type {
  Request,
  Response,
} from "express";

import { eq } from "drizzle-orm";

import { db } from "../config/db.js";

import {
  users,
} from "../db/schema.js";

export async function getUsers(
  req: Request,
  res: Response
) {
  const role =
    req.query.role as
      | "REPORTER"
      | "STAFF"
      | "ADMIN"
      | undefined;

  if (req.query.role !== undefined && !["REPORTER", "STAFF", "ADMIN"].includes(String(req.query.role))) {
    return res.status(400).json({ message: "role must be REPORTER, STAFF, or ADMIN" });
  }

  const result = role
    ? await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          teamId: users.teamId,
        })
        .from(users)
        .where(
          eq(users.role, role)
        )
    : await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          teamId: users.teamId,
        })
        .from(users);

  res.json(result);
}
