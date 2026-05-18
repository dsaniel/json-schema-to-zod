import { Options, JsonSchema } from "./Types.js";
import { buildSchema } from "./parsers/buildSchema.js";
import { z } from "zod";

export const jsonSchemaToZod = (
  schema: JsonSchema,
  { zodVersion = 4, ...rest }: Options = {},
): z.ZodTypeAny => {
  const result = buildSchema(schema, {
    path: [],
    seen: new Map(),
    zodVersion,
    ...rest,
  });

  return result;
};
