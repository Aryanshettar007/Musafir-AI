import { Router } from "express";
import { postListens } from "../controllers/listens.controller";

export const listensRouter = () => Router().post("/", postListens);
