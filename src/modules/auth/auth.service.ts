import argon2 from "argon2";

import { prisma } from "../../config/prisma.js";
import type { RegisterInput, LoginInput } from "../../schemas/auth.schema.js";

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

export async function loginUser(input: LoginInput){
    const user= await prisma.user.findUnique({
        where:{
            email: input.email,
        },
    });

    if(!user) return null;

    const isPasswordValid = await argon2.verify(
        user.passwordHash,
        input.password
    )

    if(!isPasswordValid) return null;

    const {passwordHash, ...publicUser}= user;

    return publicUser;
}

export async function getAuthenticatedUser(userId:string){
    return prisma.user.findUnique({
        where:{
            id: userId,
        },
        select:{
            id: true,
            name: true,
            email: true,
            createdAt: true,
        }
    });
}