import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { TEMP_UPLOAD_CLEANUP_BATCH } from "./constants";

const crons = cronJobs();

crons.hourly(
  "cleanup-expired-temp-uploads",
  { minuteUTC: 17 },
  internal.images.cleanupExpiredTempUploads,
  { limit: TEMP_UPLOAD_CLEANUP_BATCH }
);

export default crons;
