import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { tools } from "./kunji";
import { addKunjiRoutes } from "./lib/kunji";

const http = httpRouter();

auth.addHttpRoutes(http);
addKunjiRoutes(http, { tools, access: internal.kunji.access });

export default http;
