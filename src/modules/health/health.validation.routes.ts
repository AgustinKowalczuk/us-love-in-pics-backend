
import { Router } from "express";

import { validateRequest } from "../../middlewares/validate-request.js";
import { exampleSchema } from "../../schemas/common.schema.js";

const validationRouter = Router();

validationRouter.post(
  "/test-validation",
  validateRequest({
    body: exampleSchema,
  }),
  (req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Validación exitosa",
      data: req.body,
    });
  },
);

export default validationRouter;
