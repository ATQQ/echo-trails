import { Hono } from "hono";
import fileRouter from "./file";
import albumRouter from "./album";
import configRouter from "./config";
import userRouter from "./user";

const routers = [fileRouter, albumRouter, configRouter, userRouter]
export default function mountedRouter(app: any) {
  routers.forEach(router => {
    const child = new Hono()
    app.route(router(child), child)
  })
};
