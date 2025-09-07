import { Hono } from "hono";
import fileRouter from "./file";
import albumRouter from "./album";
import configRouter from "./config";
const routers = [fileRouter, albumRouter, configRouter]
export default function mountedRouter(app: any) {
  routers.forEach(router => {
    const child = new Hono()
    app.route(router(child), child)
  })
};
