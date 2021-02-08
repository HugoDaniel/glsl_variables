# glsl_variables

Reads a GLSL string and returns a parsed list of its variables. It only supports GLSL version 300, which is available on WebGL 2.

## Usage

Import the parser in your code and pass it a GLSL shader code string.

```typescript
import { parse } from "https://deno.land/x/glsl_variables@v1.0.2/parser.ts";

// This variable will be an array with a GLSLVariable for the "in vec4 a_position" as the first element.
const variables = parse(`#version 300 es
 in vec4 a_position;

 void main() {
 gl_Position = a_position;
 }
`);
```

### Deno

This package is [available for deno at deno.land](https://deno.land/x/glsl_variables).

## API

`parse(code: string): GLSLVariable[]`

- The `parse` function is the entry point of the parser. Receives a GLSL version 300 string (WebGL 2.0 only) and produces a list of `GLSLVariable`.

`isInputVariable(variable: GLSLVariable): boolean`

- This function returns true if a GLSLVariable is not an "out" variable.

`isOutputVariable(variable: GLSLVariable): boolean`

- This function returns true if a GLSLVariable is an "out" variable.

`isSamplerVariable( variable: GLSLVariable ): boolean`

- This function returns true if a GLSLVariable is a "sampler" variable (like "sampler2D" textures, or any other kind of sampler uniform variable).

### Types

The parser will read expressions and transform them into `GLSLVariable`s. This is defined as:

```
interface GLSLVariable {
  qualifier: Qualifier | "struct";
  type: GLSLType | "block" | "struct";
  name: string;
  amount: number;
  isInvariant: boolean;
  isCentroid: boolean;
  layout: string | null;
  precision: GLSLPrecision | null;
  block: GLSLVariable[] | null;
  structName: string | null;
}
```

This type can handle the large majority of information available in GLSL variables. It supports uniform blocks, structs, layouts, invariants, centroids, arrays, and precision modifiers.

The `GLSLType`, `GLSLPrecision`, and `Qualifier` defined above are not part of the exports. They reflect their respective concepts according to the spec of the GLSL version 300 language.

### How it works ?

This is a very simple parser for simple use cases only. It reads the shader
code and returns an array of GLSLVariable's by applying the following actions
on the shader code:

1. Remove macros and comments
2. Split by blocks { } and ( )
3. Split by expressions (these end with a ';' char in GLSL) and:
   - Read user defined types (these are 'structs' in GLSL)
   - Read input and output variables into GLSLVariable objects.

No macro expansion is done. If your shader macros are being used to define
inputs then they will not show up on the returned array.
