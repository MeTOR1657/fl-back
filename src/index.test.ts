import { describe, it, expect, beforeAll } from "vitest";
import app from "./index.js";
import request from "supertest";
import { dbClient } from "@db/client.js";
import { todoTable } from "@db/schema.js";
import Debug from "debug";

const debug = Debug("pf-test:index.test.ts");

function sum_number(a: number, b: number) {
  return a + b;
}

describe("Test sum_number function", () => {
  it("should add two numbers correctly", () => {
    const result = sum_number(1, 2);
    expect(result).toBe(3);
  });
});

describe("Todo API", () => {
  beforeAll(async () => {
    debug("Setting up database connection...");
    // Clear database before running tests
    await dbClient.delete(todoTable);
    await dbClient.insert(todoTable).values({ todoText: "Item 1" });
  });

  it("should return all todos", async () => {
    const res = await request(app).get("/todo").send();
    // Check the response status and body
    expect(res.status).toBe(200);
    // Check that the response body is an array and has the expected length
    expect(Array.isArray(res.body)).toBe(true);
    // Check that the response body has the expected length (1 item)
    expect(res.body).toHaveLength(1);
    // Check that the response body contains the expected items
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ todoText: "Item 1" })]),
    );
  });

  it("should create a new todo item with deadline", async () => {
    const deadlineStr = "2026-12-31T23:59:59.000Z";
    const resPut = await request(app).put("/todo").send({ todoText: "Item 2", deadline: deadlineStr });
    expect(resPut.status).toBe(200);
    const todos = await dbClient.query.todoTable.findMany();
    expect(todos).toHaveLength(2);
    const created = todos.find((t) => t.todoText === "Item 2");
    expect(created?.deadline).not.toBeNull();
  });

  it("should update todo item including deadline", async () => {
    // Get the existing todos to find the last one
    const todos = await dbClient.query.todoTable.findMany();
    if (todos.length === 0) {
      throw new Error("No todos found to update");
    }
    const todo = todos[todos.length - 1];
    const newDeadline = "2027-01-01T00:00:00.000Z";
    // Send a PATCH request to update the last todo item
    const resPatch = await request(app)
      .patch("/todo")
      .send({ id: todo.id, todoText: "Updated Item 1", deadline: newDeadline });
    expect(resPatch.status).toBe(200);
    // Fetch the todos again to verify the update
    const resGet = await request(app).get("/todo").send();
    const todoEdited = resGet.body.find((t: any) => t.id === todo.id);
    expect(todoEdited).toEqual(
      expect.objectContaining({ todoText: "Updated Item 1" }),
    );
    expect(todoEdited.deadline).not.toBeNull();
  });

  it("should delete a todo item", async () => {
    // Get the existing todos to find the last one
    const todos = await dbClient.query.todoTable.findMany();
    if (todos.length === 0) {
      throw new Error("No todos found to delete");
    }
    const todoLength = todos.length;
    const todo = todos[todoLength - 1];
    // Send a DELETE request to delete the last todo item
    const resDelete = await request(app).delete("/todo").send({ id: todo.id });
    expect(resDelete.status).toBe(200);
    // Fetch the todos again to verify the deletion
    const todosAfterDelete = await dbClient.query.todoTable.findMany();
    expect(todosAfterDelete).toHaveLength(todoLength - 1);
  });
});

describe("Account API", () => {
  it("should register a new account", async () => {
    const username = "testuser_" + Date.now();
    const res = await request(app).post("/register").send({
      username,
      password: "password123",
      email: "test@example.com",
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(
      expect.objectContaining({
        username,
        email: "test@example.com",
      }),
    );
  });

  it("should login with registered user", async () => {
    const username = "loginuser_" + Date.now();
    await request(app).post("/register").send({
      username,
      password: "password123",
      email: "login@example.com",
    });

    const res = await request(app).post("/login").send({
      username,
      password: "password123",
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(
      expect.objectContaining({
        username,
        email: "login@example.com",
      }),
    );
  });
});