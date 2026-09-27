import type { Response } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomBytes } from "node:crypto";
import { db } from "../config/db.js";
import { categories, locations, teams, tickets, ticketAttachments, ticketComments, ticketEvents, users } from "../db/schema.js";
import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

const statusToDb: Record<string, "OPEN" | "IN_PROGRESS" | "WAITING_INFO" | "RESOLVED" | "CLOSED"> = {
  Open: "OPEN", Pending: "WAITING_INFO", "In Progress": "IN_PROGRESS", Completed: "RESOLVED",
};
const priorityToDb: Record<string, "LOW" | "MEDIUM" | "HIGH" | "URGENT"> = {
  Low: "LOW", Medium: "MEDIUM", High: "HIGH", Urgent: "URGENT",
};
const titleCase = (value: string) => value.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const reporterUsers = alias(users, "ticket_reporter");
const assigneeUsers = alias(users, "ticket_assignee");

function ticketDto(row: {
  ticket: typeof tickets.$inferSelect;
  category: typeof categories.$inferSelect;
  location: typeof locations.$inferSelect;
  reporter: typeof users.$inferSelect;
  assignee: typeof users.$inferSelect | null;
  photos: string[];
}) {
  const status = row.ticket.status === "IN_PROGRESS" ? "In Progress"
    : row.ticket.status === "WAITING_INFO" ? "Pending"
    : row.ticket.status === "RESOLVED" || row.ticket.status === "CLOSED" ? "Completed" : "Open";
  const createdAt = row.ticket.createdAt;
  return {
    id: row.ticket.ticketNumber,
    issue: row.ticket.title,
    category: row.category.name,
    location: [row.location.building, row.location.floor && `Fl ${row.location.floor}`, row.location.room && `Rm ${row.location.room}`].filter(Boolean).join(", "),
    building: row.location.building,
    floor: row.location.floor ?? "",
    room: row.location.room ?? "",
    description: row.ticket.description,
    date: createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    submittedDate: createdAt.toLocaleDateString(),
    createdAt: createdAt.getTime(),
    status,
    priority: titleCase(row.ticket.priority),
    reporterId: row.reporter.id,
    reporterName: row.reporter.fullName,
    assignedTo: row.assignee?.fullName ?? "Unassigned",
    photos: row.photos,
    contactName: row.ticket.contactName || row.reporter.fullName,
    contactEmail: row.ticket.contactEmail || row.reporter.email,
    contactPhone: row.ticket.contactPhone ?? "",
  };
}

async function loadTicketDtos(requester: AuthenticatedRequest) {
  const filters = requester.user!.role === "REPORTER"
    ? eq(tickets.reporterId, requester.user!.userId)
    : undefined;
  const rows = await db.select({ ticket: tickets, category: categories, location: locations, reporter: reporterUsers, assignee: assigneeUsers })
    .from(tickets)
    .innerJoin(categories, eq(tickets.categoryId, categories.id))
    .innerJoin(locations, eq(tickets.locationId, locations.id))
    .innerJoin(reporterUsers, eq(tickets.reporterId, reporterUsers.id))
    .leftJoin(assigneeUsers, eq(tickets.assigneeId, assigneeUsers.id))
    .where(filters)
    .orderBy(desc(tickets.createdAt));
  const attachments = rows.length ? await db.select().from(ticketAttachments).where(inArray(ticketAttachments.ticketId, rows.map((row) => row.ticket.id))) : [];
  const photosByTicket = new Map<string, string[]>();
  for (const attachment of attachments) photosByTicket.set(attachment.ticketId, [...(photosByTicket.get(attachment.ticketId) ?? []), attachment.fileUrl]);
  return rows.map((row) => ticketDto({ ...row, photos: photosByTicket.get(row.ticket.id) ?? [] }));
}

export async function listTickets(req: AuthenticatedRequest, res: Response) {
  res.json(await loadTicketDtos(req));
}

export async function createTicket(req: AuthenticatedRequest, res: Response) {
  const { building, floor, room, category, description, priority = "Medium", photos = [], contactName = "", contactEmail = "", contactPhone = "" } = req.body ?? {};
  if (typeof building !== "string" || !building.trim() || typeof category !== "string" || !category.trim() || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ message: "building, category, and description are required" });
  }
  if (!Array.isArray(photos) || photos.length > 3 || photos.some((photo) => typeof photo !== "string" || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(photo) || photo.length > 3_000_000)) {
    return res.status(400).json({ message: "Up to three images under 2 MB each are supported" });
  }
  const priorityValue = priorityToDb[priority];
  if (!priorityValue) return res.status(400).json({ message: "Invalid priority" });

  const availableCategories = await db.select().from(categories);
  const key = category.toLowerCase();
  let categoryRow = availableCategories.find((item) => item.name.toLowerCase() === key)
    ?? availableCategories.find((item) => key.includes("hvac") && item.name.toLowerCase().includes("air"))
    ?? availableCategories.find((item) => key.includes("plumb") && item.name.toLowerCase().includes("plumb"))
    ?? availableCategories.find((item) => key.includes("electric") && item.name.toLowerCase().includes("electric"))
    ?? availableCategories.find((item) => (key.includes("furniture") || key.includes("other") || key.includes("general")) && item.name.toLowerCase().includes("furniture"))
    ?? availableCategories.find((item) => key.includes("network") && item.name.toLowerCase().includes("network"));
  if (!categoryRow) {
    const [fallbackTeam] = await db.select().from(teams).orderBy(teams.createdAt).limit(1);
    if (!fallbackTeam) return res.status(503).json({ message: "No maintenance team is configured" });
    const categoryName = key.includes("clean") ? "Cleaning & Custodial" : titleCase(category.trim());
    [categoryRow] = await db.insert(categories).values({ name: categoryName, defaultTeamId: fallbackTeam.id }).onConflictDoNothing().returning();
    categoryRow ??= (await db.select().from(categories).where(eq(categories.name, categoryName)).limit(1))[0];
  }
  const [teamRow] = categoryRow.defaultTeamId
    ? await db.select().from(teams).where(eq(teams.id, categoryRow.defaultTeamId)).limit(1)
    : await db.select().from(teams).orderBy(teams.createdAt).limit(1);
  if (!teamRow) return res.status(503).json({ message: "No maintenance team is configured" });

  const floorValue = typeof floor === "string" && floor.trim() ? floor.trim() : null;
  const roomValue = typeof room === "string" && room.trim() ? room.trim() : null;
  const [locationRow] = await db.insert(locations).values({
    name: `${building.trim()}${floorValue ? ` - Floor ${floorValue}` : ""}${roomValue ? ` - Room ${roomValue}` : ""}`,
    building: building.trim(), floor: floorValue, room: roomValue,
  }).returning();
  const number = `REQ-${Date.now()}-${randomBytes(2).toString("hex")}`;
  const [ticket] = await db.insert(tickets).values({
    ticketNumber: number,
    title: description.trim().slice(0, 255),
    description: description.trim(),
    status: "WAITING_INFO",
    priority: priorityValue,
    reporterId: req.user!.userId,
    teamId: teamRow.id,
    categoryId: categoryRow.id,
    locationId: locationRow.id,
    contactPhone: typeof contactPhone === "string" ? contactPhone.slice(0, 40) : "",
    contactName: typeof contactName === "string" ? contactName.trim().slice(0, 255) : "",
    contactEmail: typeof contactEmail === "string" ? contactEmail.trim().slice(0, 255) : "",
  }).returning();
  await db.insert(ticketEvents).values({ ticketId: ticket.id, actorId: req.user!.userId, eventType: "TICKET_CREATED", newValue: ticket.status });
  if (photos.length) await db.insert(ticketAttachments).values(photos.map((dataUrl: string, index: number) => {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl);
    const mimeType = match![1];
    const fileUrl = `data:${mimeType};base64,${match![2]}`;
    return { ticketId: ticket.id, uploadedById: req.user!.userId, fileName: `attachment-${index + 1}.${mimeType.split("/")[1]}`, fileUrl, mimeType, fileSize: Buffer.from(match![2], "base64").length };
  }));
  const list = await loadTicketDtos(req);
  const created = list.find((item) => item.id === number);
  return res.status(201).json(created);
}

export async function updateTicket(req: AuthenticatedRequest, res: Response) {
  if (req.user!.role === "REPORTER") return res.status(403).json({ message: "Only staff can update ticket status" });
  const { status, priority } = req.body ?? {};
  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketNumber, String(req.params.id))).limit(1);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  const nextStatus = typeof status === "string" ? statusToDb[status] : undefined;
  const nextPriority = typeof priority === "string" ? priorityToDb[priority] : undefined;
  if ((status !== undefined && !nextStatus) || (priority !== undefined && !nextPriority)) return res.status(400).json({ message: "Invalid status or priority" });
  const updates: Partial<typeof tickets.$inferInsert> = {};
  if (nextStatus && nextStatus !== ticket.status) {
    updates.status = nextStatus;
    if (nextStatus === "RESOLVED") updates.resolvedAt = new Date();
    await db.insert(ticketEvents).values({ ticketId: ticket.id, actorId: req.user!.userId, eventType: "STATUS_CHANGED", oldValue: ticket.status, newValue: nextStatus });
  }
  if (nextPriority && nextPriority !== ticket.priority) {
    updates.priority = nextPriority;
    await db.insert(ticketEvents).values({ ticketId: ticket.id, actorId: req.user!.userId, eventType: "PRIORITY_CHANGED", oldValue: ticket.priority, newValue: nextPriority });
  }
  if (Object.keys(updates).length) await db.update(tickets).set(updates).where(eq(tickets.id, ticket.id));
  const list = await loadTicketDtos(req);
  return res.json(list.find((item) => item.id === ticket.ticketNumber));
}

async function findAccessibleTicket(req: AuthenticatedRequest) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketNumber, String(req.params.id))).limit(1);
  if (!ticket || (req.user!.role === "REPORTER" && ticket.reporterId !== req.user!.userId)) return undefined;
  return ticket;
}

export async function listTicketComments(req: AuthenticatedRequest, res: Response) {
  const ticket = await findAccessibleTicket(req);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  const rows = await db.select({ id: ticketComments.id, message: ticketComments.message, createdAt: ticketComments.createdAt, userId: users.id, userName: users.fullName })
    .from(ticketComments).innerJoin(users, eq(ticketComments.userId, users.id))
    .where(eq(ticketComments.ticketId, ticket.id)).orderBy(ticketComments.createdAt);
  return res.json(rows);
}

export async function createTicketComment(req: AuthenticatedRequest, res: Response) {
  const ticket = await findAccessibleTicket(req);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 5000) return res.status(400).json({ message: "Comment must contain 1 to 5000 characters" });
  const [comment] = await db.insert(ticketComments).values({ ticketId: ticket.id, userId: req.user!.userId, message }).returning();
  await db.insert(ticketEvents).values({ ticketId: ticket.id, actorId: req.user!.userId, eventType: "COMMENT_ADDED", newValue: comment.id });
  const [user] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.user!.userId)).limit(1);
  return res.status(201).json({ ...comment, userId: req.user!.userId, userName: user.fullName });
}
