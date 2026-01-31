import { Hono } from "hono";
import fileRouter from "./file";
import albumRouter from "./album";
import configRouter from "./config";
import userRouter from "./user";
import weightRouter from "./weight";
import familyRouter from "./family";
import appRouter from "./app";
import bloodPressureRouter from "./bloodPressure";
import assetRouter from "./asset";
import usageRecordRouter from "./usageRecord";
import memorialRouter from "./memorial";

const routers = [appRouter, fileRouter, albumRouter, configRouter, userRouter, weightRouter, familyRouter, bloodPressureRouter, assetRouter, usageRecordRouter, memorialRouter]
export default function mountedRouter(app: any) {
  routers.forEach(router => {
    const child = new Hono()
    app.route(router(child), child)
  })
};
