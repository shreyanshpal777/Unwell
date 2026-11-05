import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { asyncHandler, ok } from "../utils/http.js";
import { assessLatestSessionLoad } from "../services/recovery/anomalyService.js";

const router = Router();
router.use(requireAuth);

// User id comes ONLY from the authenticated session, never from the client.
router.get(
  "/anomaly",
  requireRole("user"),
  asyncHandler(async (req, res) => {
    const data = await assessLatestSessionLoad((t, p) => pool.query(t, p), req.user.id);
    return ok(res, data);
  })
);

export default router;
