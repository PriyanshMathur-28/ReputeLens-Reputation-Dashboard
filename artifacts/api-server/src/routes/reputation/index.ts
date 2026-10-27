import { Router, type IRouter } from "express";
import coreRouter from "./core";
import intelligenceRouter from "./intelligence";

const router: IRouter = Router();

router.use(coreRouter);
router.use(intelligenceRouter);

export default router;
