import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reputationRouter from "./reputation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reputationRouter);

export default router;
