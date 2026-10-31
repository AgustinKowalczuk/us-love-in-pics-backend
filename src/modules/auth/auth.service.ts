import argon2 from "argon2";

import { prisma } from "../../config/prisma.js";
import type { RegisterInput } from "../../schemas/auth.schema.js";

export async function registerUser(input: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
        where:{
            email: input.email,
        },
    });

    if(existingUser) throw new Error("EMAIL_ALREADY_REGISTERED");

    const passwordHash = await argon2.hash(input.password);

    const user = await prisma.user.create({
        data:{
            name: input.name,
            email: input.email,
            passwordHash,
        },
        select:{
            id: true,
            name: true,
            email: true,
            createdAt: true,
        },
    });

    return user;
}

