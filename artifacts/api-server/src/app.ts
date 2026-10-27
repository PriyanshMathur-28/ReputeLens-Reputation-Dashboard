import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import path from "node:path";
import fs from "node:fs";

app.use("/api", router);

const staticCandidates = [
  path.resolve(process.cwd(), "artifacts/reputelens/dist/public"),
  path.resolve(import.meta.dirname, "../../reputelens/dist/public"),
  path.resolve(import.meta.dirname, "../../../artifacts/reputelens/dist/public"),
];
const staticDir = staticCandidates.find((dir) => fs.existsSync(dir));
if (staticDir) {
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
