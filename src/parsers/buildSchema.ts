import { z } from "zod";
import {
  Refs,
  JsonSchemaObject,
  JsonSchema,
  Serializable,
  SimpleDiscriminatedOneOfSchema,
} from "../Types.js";

export const buildSchema = (
  schema: JsonSchema,
  refs: Refs = { seen: new Map(), path: [] },
  blockMeta?: boolean,
): z.ZodTypeAny => {
  if (typeof schema !== "object") return schema ? z.any() : z.never();

  let seen = refs.seen.get(schema);

  if (seen) {
    if (seen.r !== undefined) {
      // For circular references, we need to return the same schema instance
      // Since we're building objects now, we'll use z.any() as a fallback
      return z.any();
    }

    if (refs.depth === undefined || seen.n >= refs.depth) {
      return z.any();
    }

    seen.n += 1;
  } else {
    seen = { r: undefined, n: 0 };
    refs.seen.set(schema, seen);
  }

  let parsed = selectBuilder(schema, refs);

  if (!blockMeta) {
    if (!refs.withoutDescribes && schema.description) {
      parsed = parsed.describe(schema.description);
    }

    if (!refs.withoutDefaults && schema.default !== undefined) {
      parsed = parsed.default(schema.default);
    }

    if (schema.readOnly) {
      parsed = parsed.readonly();
    }
  }

  return parsed;
};

const selectBuilder = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  // Check for nullable
  if ((schema as any).nullable === true) {
    return buildNullable(schema, refs);
  }

  // Check for oneOf with discriminator
  if (isSimpleDiscriminatedOneOf(schema)) {
    return buildSimpleDiscriminatedOneOf(schema as SimpleDiscriminatedOneOfSchema, refs);
  }

  // Check for unions
  if (schema.anyOf !== undefined) {
    return buildAnyOf(schema, refs);
  }

  if (schema.allOf !== undefined) {
    return buildAllOf(schema, refs);
  }

  if (schema.oneOf !== undefined) {
    return buildOneOf(schema, refs);
  }

  // Check for not
  if (schema.not !== undefined) {
    return z.any(); // Zod doesn't support 'not' directly
  }

  // Check for conditional
  if ("if" in schema && schema.if && "then" in schema && "else" in schema && schema.then && schema.else) {
    return buildConditional(schema, refs);
  }

  // Check for const
  if (schema.const !== undefined) {
    return z.literal(schema.const as any);
  }

  // Check for enum
  if (schema.enum !== undefined) {
    return buildEnum(schema);
  }

  // Check for multiple types
  if (Array.isArray(schema.type)) {
    return buildMultipleType(schema, refs);
  }

  // Handle primitive types
  switch (schema.type) {
    case "object":
      return buildObject(schema, refs);
    case "array":
      return buildArray(schema, refs);
    case "string":
      return buildString(schema);
    case "number":
    case "integer":
      return buildNumber(schema);
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    default:
      return z.any();
  }
};

const buildNullable = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  const baseSchema = { ...schema };
  delete (baseSchema as any).nullable;
  return buildSchema(baseSchema, refs).nullable();
};

const buildObject = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  const shape: Record<string, z.ZodTypeAny> = {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      const propSchema = buildSchema(value, { ...refs, path: [...refs.path, "properties", key] });
      shape[key] = required.includes(key) ? propSchema : propSchema.optional();
    }
  }

  let result = z.object(shape);

  // Handle additional properties
  if (schema.additionalProperties === false) {
    result = result.strict();
  } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    const additionalSchema = buildSchema(schema.additionalProperties, { ...refs, path: [...refs.path, "additionalProperties"] });
    result = result.catchall(additionalSchema);
  }

  return result;
};

const buildArray = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  if (Array.isArray(schema.items)) {
    // Tuple
    const tuple = schema.items.map((item, i) =>
      buildSchema(item, { ...refs, path: [...refs.path, "items", i] })
    );
    return z.tuple(tuple as any);
  } else if (schema.items) {
    let itemsSchema = z.array(buildSchema(schema.items, { ...refs, path: [...refs.path, "items"] }));

    // Apply constraints
    if (schema.minItems !== undefined) {
      itemsSchema = itemsSchema.min(schema.minItems);
    }
    if (schema.maxItems !== undefined) {
      itemsSchema = itemsSchema.max(schema.maxItems);
    }

    return itemsSchema;
  } else {
    return z.array(z.any());
  }
};

const buildString = (schema: JsonSchemaObject): z.ZodTypeAny => {
  let result: z.ZodString = z.string();

  if (schema.minLength !== undefined) {
    result = result.min(schema.minLength);
  }
  if (schema.maxLength !== undefined) {
    result = result.max(schema.maxLength);
  }
  if (schema.pattern) {
    result = result.regex(new RegExp(schema.pattern));
  }
  if (schema.format) {
    switch (schema.format) {
      case "email":
        result = result.email();
        break;
      case "uri":
      case "url":
        result = result.url();
        break;
      case "uuid":
        result = result.uuid();
        break;
      case "date-time":
        result = result.datetime();
        break;
    }
  }

  return result;
};

const buildNumber = (schema: JsonSchemaObject): z.ZodTypeAny => {
  let result: z.ZodNumber = schema.type === "integer" ? z.number().int() : z.number();

  if (schema.minimum !== undefined) {
    result = schema.exclusiveMinimum === true || schema.exclusiveMinimum === schema.minimum
      ? result.gt(schema.minimum)
      : result.gte(schema.minimum);
  }
  if (typeof schema.exclusiveMinimum === "number") {
    result = result.gt(schema.exclusiveMinimum);
  }
  if (schema.maximum !== undefined) {
    result = schema.exclusiveMaximum === true || schema.exclusiveMaximum === schema.maximum
      ? result.lt(schema.maximum)
      : result.lte(schema.maximum);
  }
  if (typeof schema.exclusiveMaximum === "number") {
    result = result.lt(schema.exclusiveMaximum);
  }
  if (schema.multipleOf !== undefined) {
    result = result.multipleOf(schema.multipleOf);
  }

  return result;
};

const buildEnum = (schema: JsonSchemaObject): z.ZodTypeAny => {
  if (!schema.enum || !Array.isArray(schema.enum) || schema.enum.length === 0) {
    return z.any();
  }

  // Check if all values are strings
  if (schema.enum.every(v => typeof v === "string")) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  // For mixed types, use union of literals
  return z.union(schema.enum.map(v => z.literal(v as any)) as [z.ZodLiteral<any>, z.ZodLiteral<any>, ...z.ZodLiteral<any>[]]);
};

const buildAnyOf = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  if (!schema.anyOf || schema.anyOf.length === 0) {
    return z.any();
  }

  const schemas = schema.anyOf.map((s, i) =>
    buildSchema(s, { ...refs, path: [...refs.path, "anyOf", i] })
  );

  if (schemas.length === 1) {
    return schemas[0];
  }

  return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
};

const buildAllOf = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  if (!schema.allOf || schema.allOf.length === 0) {
    return z.any();
  }

  const schemas = schema.allOf.map((s, i) =>
    buildSchema(s, { ...refs, path: [...refs.path, "allOf", i] })
  );

  if (schemas.length === 1) {
    return schemas[0];
  }

  // Use intersection for allOf
  return schemas.reduce((acc, curr) => acc.and(curr));
};

const buildOneOf = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  if (!schema.oneOf || schema.oneOf.length === 0) {
    return z.any();
  }

  const schemas = schema.oneOf.map((s, i) =>
    buildSchema(s, { ...refs, path: [...refs.path, "oneOf", i] })
  );

  if (schemas.length === 1) {
    return schemas[0];
  }

  return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
};

const buildSimpleDiscriminatedOneOf = (schema: SimpleDiscriminatedOneOfSchema, refs: Refs): z.ZodTypeAny => {
  const discriminatorProp = schema.discriminator.propertyName;
  const options: z.ZodObject<any>[] = [];

  for (let i = 0; i < schema.oneOf.length; i++) {
    const option = schema.oneOf[i];
    const builtOption = buildSchema(option, { ...refs, path: [...refs.path, "oneOf", i] });
    options.push(builtOption as z.ZodObject<any>);
  }

  return z.discriminatedUnion(discriminatorProp, options as any);
};

const buildMultipleType = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  if (!Array.isArray(schema.type)) {
    return z.any();
  }

  const schemas = schema.type.map(type => {
    const typeSchema = { ...schema, type };
    return buildSchema(typeSchema, refs);
  });

  if (schemas.length === 1) {
    return schemas[0];
  }

  return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
};

const buildConditional = (schema: JsonSchemaObject, refs: Refs): z.ZodTypeAny => {
  // Zod doesn't have native if/then/else support
  // We'll use superRefine to implement this
  const thenSchema = buildSchema(schema.then!, { ...refs, path: [...refs.path, "then"] });
  const elseSchema = buildSchema(schema.else!, { ...refs, path: [...refs.path, "else"] });

  // For simplicity, return a union
  return z.union([thenSchema, elseSchema] as [z.ZodTypeAny, z.ZodTypeAny]);
};

const isSimpleDiscriminatedOneOf = (
  x: JsonSchemaObject,
): x is SimpleDiscriminatedOneOfSchema => {
  if (
    !x.oneOf ||
    !Array.isArray(x.oneOf) ||
    x.oneOf.length === 0 ||
    !x.discriminator ||
    typeof x.discriminator !== "object" ||
    !("propertyName" in x.discriminator) ||
    typeof x.discriminator.propertyName !== "string"
  ) {
    return false;
  }

  const discriminatorProp = x.discriminator.propertyName;

  return x.oneOf.every((schema) => {
    if (
      !schema ||
      typeof schema !== "object" ||
      schema.type !== "object" ||
      !schema.properties ||
      typeof schema.properties !== "object" ||
      !(discriminatorProp in schema.properties)
    ) {
      return false;
    }

    const property = schema.properties[discriminatorProp];
    return (
      property &&
      typeof property === "object" &&
      property.type === "string" &&
      (property.const !== undefined ||
       (property.enum && Array.isArray(property.enum) && property.enum.length === 1)) &&
      Array.isArray(schema.required) &&
      schema.required.includes(discriminatorProp)
    );
  });
};
