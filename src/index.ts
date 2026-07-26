import "dotenv/config";
import { dbClient } from "@db/client.js";
import { todoTable, accountTable } from "@db/schema.js";
import cors from "cors";
import Debug from "debug";
import { eq } from "drizzle-orm";
import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
const debug = Debug("pf-backend");

// Initializing the express app
const app = express();

// Middleware
app.use(morgan("dev", { immediate: false }));
app.use(helmet());
app.use(
  cors({
    origin: true, // Enable CORS for frontend connection
    credentials: true,
  }),
);
// Extracts the entire body portion of an incoming request stream and exposes it on req.body.
app.use(express.json());

// Auth Endpoints connected to 'account' Database Table
const handleRegister = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    // Check if account already exists
    const existing = await dbClient.query.accountTable.findFirst({
      where: eq(accountTable.username, username),
    });

    if (existing) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Insert new user into account database table
    const result = await dbClient
      .insert(accountTable)
      .values({
        username,
        password,
        email: email || null,
      })
      .returning({ id: accountTable.id, username: accountTable.username, email: accountTable.email });

    const createdUser = result[0];
    const token = "jwt-token-" + Date.now();

    res.json({
      message: "Registration successful",
      token,
      accessToken: token,
      user: createdUser,
    });
  } catch (err) {
    next(err);
  }
};

const handleLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    // Query account from database
    const userAcc = await dbClient.query.accountTable.findFirst({
      where: eq(accountTable.username, username),
    });

    if (!userAcc || userAcc.password !== password) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = "jwt-token-" + Date.now();
    const userPayload = {
      id: userAcc.id,
      username: userAcc.username,
      email: userAcc.email,
    };

    res.json({
      message: "Login successful",
      token,
      accessToken: token,
      user: userPayload,
    });
  } catch (err) {
    next(err);
  }
};

app.post(["/login", "/auth/login"], handleLogin);
app.post(["/register", "/auth/register"], handleRegister);

// Query Todos
const getTodosHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await dbClient.query.todoTable.findMany();
    res.json(results);
  } catch (err) {
    next(err);
  }
};
app.get("/todo", getTodosHandler);
app.get("/todos", getTodosHandler);

// Insert Todo
const createTodoHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const todoText = req.body.todoText ?? "";
    const deadlineRaw = req.body.deadline;
    if (!todoText) throw new Error("Empty todoText");

    let deadline: string | null = null;
    if (deadlineRaw) {
      deadline = String(deadlineRaw).trim() || null;
    }

    const result = await dbClient
      .insert(todoTable)
      .values({
        todoText,
        deadline,
      })
      .returning();
    const createdItem = result[0];
    res.json({
      msg: `Insert successfully`,
      data: createdItem,
      ...createdItem,
    });
  } catch (err) {
    next(err);
  }
};
app.put("/todo", createTodoHandler);
app.post("/todo", createTodoHandler);
app.post("/todos", createTodoHandler);

// Update Todo
const updateTodoHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id || req.body.id || "";
    const todoText = req.body.todoText;
    const isDone = req.body.isDone;
    const deadlineRaw = req.body.deadline;

    if (!id) throw new Error("Empty id");

    // Check for existence of data
    const results = await dbClient.query.todoTable.findMany({
      where: eq(todoTable.id, id),
    });
    if (results.length === 0) throw new Error("Invalid id");

    const updateFields: { todoText?: string; isDone?: boolean; deadline?: string | null } = {};
    if (todoText !== undefined && todoText !== "") updateFields.todoText = todoText;
    if (isDone !== undefined) updateFields.isDone = Boolean(isDone);
    if (deadlineRaw !== undefined) {
      if (deadlineRaw === null || deadlineRaw === "") {
        updateFields.deadline = null;
      } else {
        updateFields.deadline = String(deadlineRaw).trim();
      }
    }

    const result = await dbClient
      .update(todoTable)
      .set(updateFields)
      .where(eq(todoTable.id, id))
      .returning();

    res.json({
      msg: `Update successfully`,
      data: result,
      ...(result[0] || {}),
    });
  } catch (err) {
    next(err);
  }
};
app.patch("/todo", updateTodoHandler);
app.patch("/todos", updateTodoHandler);
app.patch("/todo/:id", updateTodoHandler);
app.patch("/todos/:id", updateTodoHandler);
app.put("/todos/:id", updateTodoHandler);

// Delete Todo
const deleteTodoHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id || req.body.id || "";
    if (!id) throw new Error("Empty id");

    // Check for existence of data
    const results = await dbClient.query.todoTable.findMany({
      where: eq(todoTable.id, id),
    });
    if (results.length === 0) throw new Error("Invalid id");

    await dbClient.delete(todoTable).where(eq(todoTable.id, id));
    res.json({
      msg: `Delete successfully`,
      data: { id },
    });
  } catch (err) {
    next(err);
  }
};
app.delete("/todo", deleteTodoHandler);
app.delete("/todos", deleteTodoHandler);
app.delete("/todo/:id", deleteTodoHandler);
app.delete("/todos/:id", deleteTodoHandler);

app.post("/todo/all", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dbClient.delete(todoTable);
    res.json({
      msg: `Delete all rows successfully`,
      data: {},
    });
  } catch (err) {
    next(err);
  }
});

// JSON Error Middleware
const jsonErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  debug(err.message);
  const errorResponse = {
    message: err.message || "Internal Server Error",
    type: err.name || "Error",
    stack: err.stack,
  };
  res.status(500).send(errorResponse);
};
app.use(jsonErrorHandler);

// Running app
const PORT = process.env.PORT || 3000;
// * Running app
app.listen(PORT, async () => {
  debug(`Listening on port ${PORT}: http://localhost:${PORT}`);
});

// Add this line to export the app for testing
export default app;

