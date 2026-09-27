import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { verifyToken } from "../utils/jwt.js";

export interface AuthenticatedRequest
  extends Request {
  user?: {
    userId: string;
    email: string;
    role: "REPORTER" | "STAFF" | "ADMIN";
  };
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const header =
      req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token =
      header.substring(7);

    const payload =
      verifyToken(token);

    req.user = payload;

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}