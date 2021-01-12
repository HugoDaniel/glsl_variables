# glsl_variables

Reads a GLSL string and returns a parsed list of its variables. It only supports GLSL version 300, which is available on WebGL 2.

## Usage

Import the parser in your code and pass it a GLSL shader code string.
```typescript
import { parse } from "./parser.ts";

// This variable will be an array with a GLSLVariable for the "in vec4 a_position" as the first element.
const variables = parse(`#version 300 es
 in vec4 a_position;

 void main() {
 gl_Position = a_position;
 }
`);
```

## API

`parse(code: string): GLSLVariable[]`

* The `parse` function is the entry point of the parser. Receives a GLSL version 300 string (WebGL 2.0 only) and produces a list of `GLSLVariable`.

`isInputVariable(variable: GLSLVariable): boolean`
 
* This function returns true if a GLSLVariable is not an "out" variable.

`isOutputVariable(variable: GLSLVariable): boolean`
 
* This function returns true if a GLSLVariable is an "out" variable.

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