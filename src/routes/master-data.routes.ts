import { Router } from "express";

import {
  getTeams,
  getCategories,
  getLocations,
  createTeam,
  createCategory,
  createLocation,
} from "../controllers/master-data.controller.js";

import { requireAuth } from "../middleware/auth.middleware.js";

import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get(
  "/teams",
  requireAuth,
  getTeams
);

router.get(
  "/categories",
  requireAuth,
  getCategories
);

router.get(
  "/locations",
  requireAuth,
  getLocations
);

router.post(
  "/teams",
  requireAuth,
  requireRole("ADMIN"),
  createTeam
);

router.post(
  "/categories",
  requireAuth,
  requireRole("ADMIN"),
  createCategory
);

router.post(
  "/locations",
  requireAuth,
  requireRole("ADMIN"),
  createLocation
);

export default router;