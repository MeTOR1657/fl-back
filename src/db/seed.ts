import bcrypt from "bcryptjs";
import { db } from "../config/db.js";
import { users, teams, categories, locations } from "./schema.js";

export async function seedInitialData(): Promise<void> {
  try {
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUsers.length === 0) {
      console.log("Seeding initial master data and users...");

      // Seed teams
      const [itTeam, facTeam] = await db
        .insert(teams)
        .values([
          { name: "IT Support", description: "Hardware, software, and networking issues" },
          { name: "Facilities Management", description: "Building maintenance, plumbing, electrical" },
        ])
        .onConflictDoNothing()
        .returning();

      // Seed categories
      await db
        .insert(categories)
        .values([
          { name: "Electrical & Lighting", description: "Faulty lights, power outlets", defaultTeamId: facTeam?.id },
          { name: "Air Conditioning", description: "AC unit repairs and leaks", defaultTeamId: facTeam?.id },
          { name: "Plumbing & Restroom", description: "Water leaks, broken toilets", defaultTeamId: facTeam?.id },
          { name: "Network & Wi-Fi", description: "Internet and network connection issues", defaultTeamId: itTeam?.id },
          { name: "Furniture & Facilities", description: "Broken desks, chairs, doors, windows", defaultTeamId: facTeam?.id },
        ])
        .onConflictDoNothing();

      // Seed locations
      await db
        .insert(locations)
        .values([
          { name: "Engineering Building 1 - Room 101", building: "ENG-1", floor: "1", room: "101" },
          { name: "Engineering Building 2 - Computer Lab", building: "ENG-2", floor: "2", room: "204" },
          { name: "Central Library - 2nd Floor", building: "Main Library", floor: "2", room: "Study Area" },
          { name: "Student Union Building", building: "Student Union", floor: "1", room: "Lobby" },
        ])
        .onConflictDoNothing();

      // Seed default users
      const passwordHash = await bcrypt.hash("123456", 12);
      await db
        .insert(users)
        .values([
          {
            email: "bimcub12345@cmu.ac.th",
            fullName: "Admin Supakorn Suksomboon",
            passwordHash,
            role: "ADMIN",
            teamId: itTeam?.id,
          },
          {
            email: "admin@cmu.ac.th",
            fullName: "Facilities Admin",
            passwordHash,
            role: "ADMIN",
            teamId: facTeam?.id,
          },
          {
            email: "student@cmu.ac.th",
            fullName: "Supakorn Suksomboon",
            passwordHash,
            role: "REPORTER",
          },
          {
            email: "staff@cmu.ac.th",
            fullName: "CampusFix Staff",
            passwordHash,
            role: "STAFF",
            teamId: facTeam?.id,
          },
        ])
        .onConflictDoNothing();

      console.log("Seeding completed successfully.");
    }
  } catch (error) {
    console.error("Error during initial data seeding (non-fatal):", error);
  }
}
