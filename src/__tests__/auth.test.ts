import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../config/prisma.js";
import { app } from "../app.js";

beforeEach(async () => {
  await prisma.user.deleteMany();
});

describe("Auth", () => {
  it("registers a new user", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      name: "Agustin",
      email: "agustin@example.com",
      password: "MyPassword123!",
    });

    expect(response.status).toBe(201);

    expect(response.body.data.user.email).toBe("agustin@example.com");

    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("rejects duplicated email", async () => {
    await request(app).post("/api/v1/auth/register").send({
      name: "Agustin",
      email: "agustin@example.com",
      password: "MyPassword123!",
    });

    const response = await request(app).post("/api/v1/auth/register").send({
      name: "Mayra",
      email: "agustin@example.com",
      password: "AnotherPassword123!",
    });

    expect(response.status).toBe(409);
  });

  it("logs in and keeps the session", async () => {
    const agent = request.agent(app);

    await agent.post("/api/v1/auth/register").send({
      name: "Agustin",
      email: "agustin@example.com",
      password: "MyPassword123!",
    });

    await agent.post("/api/v1/auth/logout");

    const login = await agent.post("/api/v1/auth/login").send({
      email: "agustin@example.com",
      password: "MyPassword123!",
    });

    expect(login.status).toBe(200);

    const me = await agent.get("/api/v1/auth/me");

    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe("agustin@example.com");
  });

  it("logs out the user", async () => {
    const agent = request.agent(app);

    await agent.post("/api/v1/auth/register").send({
      name: "Agustin",
      email: "agustin@example.com",
      password: "MyPassword123!",
    });

    const logout = await agent.post("/api/v1/auth/logout");

    expect(logout.status).toBe(200);

    const me = await agent.get("/api/v1/auth/me");

    expect(me.status).toBe(401);
  });
});
