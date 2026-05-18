import {
  JSONSchema4,
  JSONSchema6Definition,
  JSONSchema7Definition,
} from "json-schema";
import jsonSchemaToZod from "../src";
import { suite } from "./suite";
import { z } from "zod";

suite("jsonSchemaToZod", (test) => {
  test("should accept json schema 7 and 4", (assert) => {
    const schema = { type: "string" } as unknown;

    assert(jsonSchemaToZod(schema as JSONSchema4) instanceof z.ZodType);
    assert(jsonSchemaToZod(schema as JSONSchema6Definition) instanceof z.ZodType);
    assert(jsonSchemaToZod(schema as JSONSchema7Definition) instanceof z.ZodType);
  });

  test("should produce a Zod schema object from a simple JSON schema", (assert) => {
    const schema = jsonSchemaToZod({ type: "string" });
    assert(schema instanceof z.ZodString);
    assert(schema.safeParse("test").success);
    assert(!schema.safeParse(123).success);
  });

  test("should handle object schemas", (assert) => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" }
      },
      required: ["name"]
    });

    assert(schema instanceof z.ZodObject);
    assert(schema.safeParse({ name: "John", age: 30 }).success);
    assert(schema.safeParse({ name: "John" }).success);
    assert(!schema.safeParse({ age: 30 }).success);
  });

  test("should handle array schemas", (assert) => {
    const schema = jsonSchemaToZod({
      type: "array",
      items: { type: "string" }
    });

    assert(schema instanceof z.ZodArray);
    assert(schema.safeParse(["a", "b", "c"]).success);
    assert(!schema.safeParse([1, 2, 3]).success);
  });

  test("should include defaults", (assert) => {
    const schema = jsonSchemaToZod({
      type: "string",
      default: "foo",
    });

    const result = schema.parse(undefined);
    assert(result === "foo");
  });

  test("should include falsy defaults", (assert) => {
    const schema = jsonSchemaToZod({
      type: "string",
      default: "",
    });

    const result = schema.parse(undefined);
    assert(result === "");
  });

  test("should handle const values", (assert) => {
    const schema = jsonSchemaToZod({
      type: "string",
      const: "test",
    });

    assert(schema.safeParse("test").success);
    assert(!schema.safeParse("other").success);
  });

  test("can exclude defaults", (assert) => {
    const schema = jsonSchemaToZod({
      type: "string",
      default: "foo",
    }, { withoutDefaults: true });

    assert(!schema.safeParse(undefined).success);
  });

  test("should include describes", (assert) => {
    const schema = jsonSchemaToZod({
      type: "string",
      description: "foo",
    });

    assert(schema.description === "foo");
  });

  test("can exclude describes", (assert) => {
    const schema = jsonSchemaToZod({
      type: "string",
      description: "foo",
    }, { withoutDescribes: true });

    assert(schema.description === undefined);
  });

  test("should handle nested object schemas", (assert) => {
    const schema = jsonSchemaToZod({
      type: "object",
      description: "Description for schema",
      properties: {
        prop: {
          type: "string",
          description: "Description for prop"
        },
        obj: {
          type: "object",
          description: "Description for object",
          properties: {
            nestedProp: {
              type: "string",
              description: "Description for nestedProp"
            }
          }
        }
      }
    });

    assert(schema instanceof z.ZodObject);
    assert(schema.safeParse({ prop: "test", obj: { nestedProp: "nested" } }).success);
  });

  test("will remove optionality if default is present", (assert) => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        prop: {
          type: "string",
          default: "def",
        },
      },
    });

    const result = schema.parse({});
    assert(result.prop === "def");
  });

  test("will handle falsy defaults", (assert) => {
    const schema = jsonSchemaToZod({
      type: "boolean",
      default: false,
    });

    const result = schema.parse(undefined);
    assert(result === false);
  });

  test("will ignore undefined as default", (assert) => {
    const schema = jsonSchemaToZod({
      type: "null",
      default: undefined,
    });

    assert(schema instanceof z.ZodNull);
  });

  test("should handle boolean JSON schemas", (assert) => {
    const anySchema = jsonSchemaToZod(true);
    const neverSchema = jsonSchemaToZod(false);

    assert(anySchema.safeParse("anything").success);
    assert(!neverSchema.safeParse("anything").success);
  });
});
