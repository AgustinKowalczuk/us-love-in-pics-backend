import type { RequestHandler } from "express";

//middleware to require a user session
export const requireAuth: RequestHandler = (req, res, next) => {
    if(!req.session.userId){
        res.status(401).json({
            status:"error",
            message:"Authentication required",
        });
        return;
    }

    next();
};
