import { Router } from "express";

import {
  getUsers,
} from "../controllers/users.controller.js";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireRole,
} from "../middleware/role.middleware.js";

const router = Router();

router.get(
  "/users",
  requireAuth,
  requireRole("STAFF", "ADMIN"),
  getUsers
);

export default router;