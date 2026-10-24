// POST /api/ops-ui/pause — "Pause all sales" (basic auth via src/proxy.ts). Counts as a human intervention.
import { handleKillSwitch } from "../handler";

export async function POST(req: Request) {
  return handleKillSwitch(req, true);
}
