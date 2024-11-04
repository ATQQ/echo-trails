import { Hono } from "hono";
import fileRouter from "./file";

const routers = [fileRouter]
export default function mountedRouter(app:any){
  routers.forEach(router => {
    const child = new Hono()
    app.route(router(child),child)
  })
};
