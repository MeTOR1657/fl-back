import type {
  Request,
  Response,
} from "express";

import { eq } from "drizzle-orm";

import { db } from "../config/db.js";

import {
  teams,
  categories,
  locations,
} from "../db/schema.js";

export async function getTeams(
  _req: Request,
  res: Response
) {
  const result =
    await db.select().from(teams);

  res.json(result);
}

export async function getCategories(
  _req: Request,
  res: Response
) {
  const result =
    await db.select().from(categories);

  res.json(result);
}

export async function getLocations(
  _req: Request,
  res: Response
) {
  const result =
    await db.select().from(locations);

  res.json(result);
}

export async function createTeam(
  req: Request,
  res: Response
) {
  const {
    name,
    description,
  } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "name is required",
    });
  }

  const [team] =
    await db
      .insert(teams)
      .values({
        name,
        description,
      })
      .returning();

  res.status(201).json(team);
}

export async function createCategory(
  req: Request,
  res: Response
) {
  const {
    name,
    description,
    defaultTeamId,
  } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "name is required",
    });
  }

  const [category] =
    await db
      .insert(categories)
      .values({
        name,
        description,
        defaultTeamId:
          defaultTeamId ?? null,
      })
      .returning();

  res.status(201).json(category);
}

export async function createLocation(
  req: Request,
  res: Response
) {
  const {
    name,
    building,
    floor,
    room,
    latitude,
    longitude,
  } = req.body;

  if (!name || !building) {
    return res.status(400).json({
      message:
        "name and building are required",
    });
  }

  const [location] =
    await db
      .insert(locations)
      .values({
        name,
        building,
        floor,
        room,
        latitude,
        longitude,
      })
      .returning();

  res.status(201).json(location);
}
