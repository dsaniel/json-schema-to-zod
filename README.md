# Json-Schema-to-Zod

[![NPM Version](https://img.shields.io/npm/v/json-schema-to-zod.svg)](https://npmjs.org/package/json-schema-to-zod)
[![NPM Downloads](https://img.shields.io/npm/dw/json-schema-to-zod.svg)](https://npmjs.org/package/json-schema-to-zod)

# Notice of deprecation

As of March 2026, this project will no longer be actively maintained.

_Thank you to all the contributors and sponsors throughout the years! So long, and thanks for all the fish._

## Summary

A runtime package to convert JSON schema (draft 4+) objects into Zod schemas.

_Looking for the exact opposite? Check out [zod-to-json-schema](https://npmjs.org/package/zod-to-json-schema)_

## Usage

### Online

[Just paste your JSON schemas here!](https://stefanterdell.github.io/json-schema-to-zod-react/)

### Programmatic

#### Simple example

```typescript
import { jsonSchemaToZod } from "json-schema-to-zod";

const myObject = {
  type: "object",
  properties: {
    hello: {
      type: "string",
    },
  },
};

// Returns a Zod schema object directly
const zodSchema = jsonSchemaToZod(myObject);

// You can now use the schema to validate data
const result = zodSchema.parse({ hello: "world" });
```

#### Zod Version Targeting

This package supports generating schemas compatible with both Zod v3 and v4. By default, Zod v4 syntax is generated.

**Key differences between versions:**

- **`z.record()`**: Zod v4 requires an explicit key type: `z.record(z.string(), valueSchema)` vs `z.record(valueSchema)` in v3
- **Error paths**: Zod v4 uses simplified error paths in `superRefine` callbacks

```typescript
// Zod v4 (default)
const zodSchema = jsonSchemaToZod(schema, { zodVersion: 4 });

// Zod v3
const zodSchema = jsonSchemaToZod(schema, { zodVersion: 3 });
```

#### Example with `$refs` resolved

```typescript
import { z } from "zod";
import { resolveRefs } from "json-refs";
import jsonSchemaToZod from "json-schema-to-zod";

async function example(jsonSchema: Record<string, unknown>): Promise<z.ZodTypeAny> {
  const { resolved } = await resolveRefs(jsonSchema);
  const zodSchema = jsonSchemaToZod(resolved);

  return zodSchema;
}
```

#### Overriding a parser

You can pass a function to the `parserOverride` option, which represents a function that receives the current schema node and the reference object, and should return a string when it wants to replace a default output. If the default output should be used for the node just return void.

#### Schema factoring

Factored schemas (like object schemas with "oneOf" etc.) is only partially supported. Here be dragons.

#### Runtime Usage

`jsonSchemaToZod` returns Zod schema objects directly, making it suitable for runtime use:

```typescript
import { jsonSchemaToZod } from "json-schema-to-zod";

const zodSchema = jsonSchemaToZod({ type: "string" });

// Use the schema directly at runtime
const result = zodSchema.safeParse("Hello, world!");
```

**Note:** JSON Schema and Zod do not overlap 100%, and the scope of the parsers are purposefully limited. Some details of the original schema may be lost in translation. For complete JSON Schema validation, you may still want to use tools such as [Ajv](https://ajv.js.org/).
