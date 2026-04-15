import { z } from "zod";

import { ValidationError } from "./errors.js";
import type { SensorData } from "./models.js";

const zSensorData = z.object({
    value: z.number(),
    unit: z.string(),
});

export function parseSensorData(raw: unknown): SensorData {
    const result = zSensorData.safeParse(raw);
    if (!result.success) {
        throw new ValidationError("Invalid decrypted sensor data", {
            cause: result.error,
        });
    }
    return result.data;
}
