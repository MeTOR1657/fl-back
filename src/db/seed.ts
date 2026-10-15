import bcrypt from "bcryptjs";
import { db } from "../config/db.js";
import { users, teams, categories, locations } from "./schema.js";

export async function seedInitialData(): Promise<void> {
  try {
    console.log("Ensuring initial master data and default users exist...");

    await db
      .insert(teams)
      .values([
        { name: "IT Support", description: "Hardware, software, and networking issues" },
        { name: "Facilities Management", description: "Building maintenance, plumbing, electrical" },
      ])
      .onConflictDoNothing();

    const allTeams = await db.select().from(teams);
    const itTeam = allTeams.find((t) => t.name === "IT Support");
    const facTeam = allTeams.find((t) => t.name === "Facilities Management");

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

    await db
      .insert(locations)
      .values([
        { name: "Engineering Building 1 - Room 101", building: "ENG-1", floor: "1", room: "101" },
        { name: "Engineering Building 2 - Computer Lab", building: "ENG-2", floor: "2", room: "204" },
        { name: "Central Library - 2nd Floor", building: "Main Library", floor: "2", room: "Study Area" },
        { name: "Student Union Building", building: "Student Union", floor: "1", room: "Lobby" },
      ])
      .onConflictDoNothing();

    const passwordHash = await bcrypt.hash("123456", 12);
    await db
      .insert(users)
      .values([
        {
          email: "bimcub12345@cmu.ac.th",
          fullName: "Admin Supakorn Suksomboon",
          studentId: "650610123",
          faculty: "สำนักงานบริหารจัดการอาคารและสถานที่",
          major: "Computer Engineering",
          passwordHash,
          role: "ADMIN",
          teamId: itTeam?.id,
        },
        {
          email: "admin@cmu.ac.th",
          fullName: "Facilities Admin",
          studentId: "650610001",
          faculty: "สำนักงานบริหารจัดการอาคารและสถานที่",
          major: "Computer Engineering",
          passwordHash,
          role: "ADMIN",
          teamId: facTeam?.id,
        },
        {
          email: "student@cmu.ac.th",
          fullName: "Supakorn Suksomboon",
          studentId: "650610123",
          faculty: "คณะวิศวกรรมศาสตร์",
          major: "สาขาวิศวกรรมคอมพิวเตอร์",
          passwordHash,
          role: "REPORTER",
        },
        {
          email: "tortrakun_s@cmu.ac.th",
          fullName: "Tortrakun S",
          studentId: null,
          faculty: "คณะวิศวกรรมศาสตร์",
          major: "",
          passwordHash: await bcrypt.hash("246810Cho", 12),
          role: "REPORTER",
        },
        {
          email: "staff@cmu.ac.th",
          fullName: "CampusFix Staff",
          studentId: "650610002",
          faculty: "กองอาคารสถานที่",
          major: "ฝ่ายซ่อมบำรุง",
          passwordHash,
          role: "STAFF",
          teamId: facTeam?.id,
        },
      ])
      .onConflictDoNothing();

    console.log("Master data and default users check completed.");
  } catch (error) {
    console.error("Error during initial data seeding (non-fatal):", error);
  }
}
