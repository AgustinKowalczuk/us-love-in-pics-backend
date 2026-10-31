import type { RequestHandler } from "express";

import { registerUser } from "./auth.service.js";

export const registerController: RequestHandler = async(req, res, next)=>{
    try{
        const user = await registerUser(req.body);

        //Session regeneration to prevent session fixation.

        await new Promise<void>((resolve,reject)=>{
            req.session.regenerate((error)=>{
                if(error){
                    reject(error);
                    return;
                }
                resolve();
            });
        });

        //session assignment with user registration
        req.session.userId= user.id;
    
        //session persistence before responding
        await new Promise<void>((resolve,reject)=>{
            req.session.save((error)=>{
                if(error){
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        res.status(201).json({
            status:"success",
            message:"User registration successful",
            data:{
                user,
            },
        });
    } catch(error){
        if(error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED"){
            res.status(409).json({
                status:"error",
                message: "The email address already exists."
            });
            return;
        }
        next(error);
    }
};
