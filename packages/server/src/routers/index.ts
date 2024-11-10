import { Hono } from "hono";
import fileRouter from "./file";
import albumRouter from "./album";
const routers = [fileRouter, albumRouter]
export default function mountedRouter(app: any) {
  routers.forEach(router => {
    const child = new Hono()
    app.route(router(child), child)
  })
};
