import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createTicket, createTicketComment, listTicketComments, listTickets, updateTicket } from "../controllers/tickets.controller.js";

const router = Router();
router.get("/", requireAuth, listTickets);
router.post("/", requireAuth, createTicket);
router.get("/:id/comments", requireAuth, listTicketComments);
router.post("/:id/comments", requireAuth, createTicketComment);
router.patch("/:id", requireAuth, updateTicket);

export default router;
