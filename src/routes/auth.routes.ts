import { Router } from "express";

import {
  register,
  login,
  startGoogleOAuth,
  googleOAuthCallback,
} from "../controllers/auth.controller.js";
import { db } from "../config/db.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const [user] = await db.select({
    id: users.id,
    email: users.email,
    fullName: users.fullName,
    avatarUrl: users.avatarUrl,
    studentId: users.studentId,
    faculty: users.faculty,
    major: users.major,
    role: users.role,
    teamId: users.teamId,
  }).from(users).where(eq(users.id, req.user!.userId)).limit(1);
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ user });
});

router.patch("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { fullName, avatarUrl, studentId, faculty, major } = req.body ?? {};
  if (fullName !== undefined && (typeof fullName !== "string" || !fullName.trim() || fullName.length > 255)) {
    return res.status(400).json({ message: "Full name must be between 1 and 255 characters" });
  }
  if (avatarUrl !== undefined && (typeof avatarUrl !== "string" || avatarUrl.length > 7_000_000)) {
    return res.status(400).json({ message: "Invalid profile image" });
  }
  const optionalFields = [studentId, faculty, major];
  if (optionalFields.some((value) => value !== undefined && (typeof value !== "string" || value.length > 255))) {
    return res.status(400).json({ message: "Profile fields are too long" });
  }
  const [user] = await db.update(users).set({
    ...(fullName !== undefined ? { fullName: fullName.trim() } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    ...(studentId !== undefined ? { studentId } : {}),
    ...(faculty !== undefined ? { faculty } : {}),
    ...(major !== undefined ? { major } : {}),
  }).where(eq(users.id, req.user!.userId)).returning({
    id: users.id, email: users.email, fullName: users.fullName, avatarUrl: users.avatarUrl,
    studentId: users.studentId, faculty: users.faculty, major: users.major, role: users.role, teamId: users.teamId,
  });
  return res.json({ user });
});

router.get("/google", startGoogleOAuth);
router.get("/google/callback", googleOAuthCallback);

router.post(
  "/register",
  register
);

router.post(
  "/login",
  login
);

export default router;
