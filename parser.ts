/**
 * This function returns the list of parsed input/output variables in a shader
 * code string. It works in three stages:
 *
 * 1. split all lines and ignore comments and lines that start with "#"
 * 2. trim all expressions (split by the ';' char) and consider only those
 * that start with the string "attribute", "uniform" or "layout" or "in" or
 * "out".
 * 3. for each line that matched the previous point, parse it with the function
 * `readVariable()` - this function gets the type, qualifier and name of the
 * variable and produces the `GLSLVariable` object - or throws an exception if
 * it fails to read the variable.
 *
 * `parseVariables()` returns the array of all variables processed by the
 * `readVariable()` function
 *
 * @param code the string with the GLSL shader code to analyze and parse
 */
export function parseVariables(code: string) {
  // All code blocks will be removed from the input "code" string
  // and their contents will be placed on this "blocks" array.
  // i.e.
  // "main() {outColor = texture(u_texture, v_texcoord); }" becomes:
  // "main() {0}"
  // the number inside the block is the index of the "blocks" array where
  // the content was placed at. This means that "blocks[0]" will have
  // "outColor = texture(u_texture, v_texcoord); " as its content.
  const blocks: string[] = [];
  // Remove macros
  let shaderCode = code.split("\n").filter((line) =>
    !line.trim().startsWith("#")
  ).join("\n");
  // clear the content of comments, there is no need to process
  // these, and their contents might interfere with the rest of the parser
  // (e.g. a comment can have code inside - that code should be ignored)
  shaderCode = replaceBlocks(shaderCode, "//", "\n");
  shaderCode = shaderCode.split("//").join("");
  shaderCode = replaceBlocks(shaderCode, "/*", "*/");
  shaderCode = shaderCode.split("/**/").join("");
  // match the content inside { } and place it in the blocks array.
  shaderCode = replaceBlocks(
    shaderCode,
    "{",
    "}",
    (match) => String(blocks.push(match) - 1),
  );
  // match the content inside parenthesis ( ) and place it in the blocks array.
  shaderCode = replaceBlocks(
    shaderCode,
    "(",
    ")",
    (match) => String(blocks.push(match) - 1),
  );
  const structs = readExpressions(
    shaderCode,
    { blocks, expressionFilter: expressionStructsFilter },
  );
  const extraTypes = structs.map((s) => s.name).filter((s) =>
    typeof s === "string"
  ) as string[];
  return (readExpressions(shaderCode, { blocks, structs, extraTypes }).concat(
    structs,
  )).map(
    fromPartialToFullVariable,
  );
}

function readExpressions(
  code: string,
  {
    expressionFilter = expressionShaderIOFilter,
    blocks = [],
    structs = [],
    extraTypes = [],
  }: {
    expressionFilter?: (words: string[]) => boolean;
    blocks?: string[];
    structs?: Partial<GLSLVariable>[];
    extraTypes?: string[];
  },
) {
  return (
    code
      // split expressions, in GLSL these end with the ';' char
      .split(";")
      // split each expression into an array of words (this regex matches only
      // non-whitespace chars - transforming a string into an array of words)
      .map((expression) => expression.match(/\S+/g) || [])
      // consider only the expressions that match the provided filter
      // this by default filters expressions that declare variables
      .filter(expressionFilter)
      // transform each expression filtered above into a `GLSLVariable` object
      // this map(readVariable) does `string[][] => GLSLVariable[]`
      .map((expressionWords: string[]) =>
        readVariable(expressionWords, { blocks, structs, extraTypes })
      )
  );
}

// discard every expression that does not start with what can be a
// variable declaration
function expressionShaderIOFilter(expressionWords: string[]) {
  if (expressionWords.length === 0) return false;
  // split in words (whitespace is discarded):
  const initialWord = expressionWords[0];
  // remove all expressions that do not start with one of these strings:
  return (
    (
      initialWord === "uniform" ||
      initialWord === "in" ||
      initialWord === "out" ||
      initialWord.includes("layout") ||
      (initialWord.includes("precision") && expressionWords.length > 3)
    )
  );
}

function createVariablesFilter(extraTypes: string[]) {
  return ((expressionWords: string[]) => {
    if (expressionWords.length === 0) return false;
    return (isGLSLType(expressionWords[0]) ||
      extraTypes.includes(expressionWords[0]) ||
      expressionShaderIOFilter(expressionWords));
  });
}

function expressionStructsFilter(expressionWords: string[]) {
  if (expressionWords.length === 0) return false;
  return (expressionWords[0] === "struct");
}

function replaceBlocks(
  code: string,
  blockStart: string,
  blockEnd: string,
  replacer: (match: string) => string = () => "",
): string {
  const blocks = code.split(blockStart);
  let result = code;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const endIndex = b.indexOf(blockEnd);
    if (endIndex > 0) {
      result = result.replace(b.slice(0, endIndex), replacer);
    }
  }
  return result;
}

type Qualifier = "in" | "uniform" | "out";
function isQualifier(value: unknown): value is Qualifier {
  return (
    typeof value === "string" &&
    (value === "in" || value === "uniform" || value === "out")
  );
}

export interface GLSLVariable {
  // "struct" is used when declaring a struct; in which case the type will be
  // "block" and the variables present on the struct present on the "block"
  // array
  qualifier: Qualifier | "struct";
  // type is struct when the variable is using a struct; in which case the
  // name of the struct being used is passed on the attribute "structName"
  type: GLSLType | "block" | "struct";
  name: string;
  amount: number;
  isInvariant: boolean;
  isCentroid: boolean;
  layout: string | null;
  precision: GLSLPrecision | null;
  block: Partial<GLSLVariable>[] | null;
  structName: string | null;
}
/** Type-guard for the `GLSLVariable` interface */
function isGLSLVariable(value: unknown): value is GLSLVariable {
  return (
    typeof value === "object" &&
    value !== null &&
    "qualifier" in value &&
    ((value as GLSLVariable).qualifier === "struct" ||
      isQualifier((value as GLSLVariable).qualifier)) &&
    "type" in value &&
    ((value as GLSLVariable).type === "block" ||
      isGLSLType((value as GLSLVariable).type)) &&
    "name" in value &&
    typeof (value as GLSLVariable).name === "string" &&
    "amount" in value &&
    typeof (value as GLSLVariable).amount === "number" &&
    "isInvariant" in value &&
    typeof (value as GLSLVariable).isInvariant === "boolean" &&
    "isCentroid" in value &&
    typeof (value as GLSLVariable).isCentroid === "boolean" &&
    "layout" in value &&
    ((value as GLSLVariable).layout === null ||
      typeof (value as GLSLVariable).layout === "string") &&
    "precision" in value &&
    ((value as GLSLVariable).precision === null ||
      isGLSLPrecision((value as GLSLVariable).precision as string))
  );
}

function parseExpressionWord(
  word: string,
  variable: Partial<GLSLVariable>,
  extraTypes: string[] = [],
): Partial<GLSLVariable> {
  if (!variable.qualifier && (isQualifier(word) || word === "struct")) {
    variable.qualifier = word;
    return variable;
  }
  if (!variable.structName && extraTypes.includes(word)) {
    variable.type = "struct";
    variable.structName = word;
    return variable;
  }
  if (!variable.type && isGLSLType(word)) {
    variable.type = word;
    return variable;
  }
  const bracketIndex = word.indexOf("[");
  if (bracketIndex >= 0) {
    // is an array
    variable.amount = Number(
      word.slice(bracketIndex + 1, word.indexOf("]")),
    );
    if (bracketIndex > 0) {
      variable.name = word.slice(0, bracketIndex);
    }
    return variable;
  }
  if (!variable.isCentroid && word === "centroid") {
    variable.isCentroid = true;
    return variable;
  }
  if (!variable.isInvariant && word === "invariant") {
    variable.isInvariant = true;
    return variable;
  }
  if (!variable.precision && isGLSLPrecision(word)) {
    variable.precision = word;
    return variable;
  }
  if (!variable.name) {
    variable.name = word;
    return variable;
  }

  return variable;
}

/**
 * Creates a GLSLVariable with default values set on most attributes. The
 *  returned variable is intended to be set with proper values and all its
 * attributes are optional.
 * 
 * A `Partial<GLSLVariable>` can be transformed into a GLSLVariable through
 * the type-guard `isGLSLVariable()`.
 */
function createPartialVariable(): Partial<GLSLVariable> {
  return {
    precision: null,
    layout: null,
    block: null,
    isCentroid: false,
    isInvariant: false,
    amount: 1,
    structName: null,
  };
}

/*
layout (std140) uniform matrix {
    mat4 mvp;
} matrixBlock;
*/

function processWordsWithin(
  expressionWords: string[],
  leftLimit: string,
  rightLimit: string,
  processor: (input: string[]) => void,
): string[] {
  const result = [];
  let processorInput: string[] = [];
  const layoutStartIndex = expressionWords.findIndex((w) =>
    w.includes(leftLimit)
  );
  const layoutEndIndex = expressionWords.findIndex((w) =>
    w.includes(rightLimit)
  );
  if (layoutStartIndex === -1 && layoutEndIndex === -1) {
    return expressionWords;
  }
  const lastLayoutWord = expressionWords[layoutEndIndex];

  if (typeof lastLayoutWord === "undefined" || lastLayoutWord.length === 0) {
    return expressionWords;
  }
  if (layoutStartIndex === layoutEndIndex) {
    processorInput.push(
      lastLayoutWord.slice(
        lastLayoutWord.indexOf(leftLimit) + 1,
        lastLayoutWord.indexOf(rightLimit),
      ),
    );
  } else {
    processorInput.push(expressionWords[layoutStartIndex].slice(
      expressionWords[layoutStartIndex].indexOf(leftLimit) + 1,
    ));
    processorInput = processorInput.concat(
      expressionWords.slice(layoutStartIndex + 1, layoutEndIndex),
    );
    processorInput.push(lastLayoutWord.slice(
      0,
      lastLayoutWord.indexOf(rightLimit),
    ));
  }
  processor(processorInput);
  // Last word
  if (lastLayoutWord.indexOf(rightLimit) < lastLayoutWord.length - 1) {
    result.push(lastLayoutWord.slice(lastLayoutWord.indexOf(rightLimit) + 1));
  }
  return result.concat(expressionWords.slice(layoutEndIndex + 1));
}

function readVariable(
  expressionWords: string[],
  {
    blocks = [],
    structs = [],
    extraTypes = [], // useful for structs
  }: {
    blocks: string[];
    structs: Partial<GLSLVariable>[];
    extraTypes?: string[];
  },
): Partial<GLSLVariable> {
  const variable: Partial<GLSLVariable> = createPartialVariable();
  let words = expressionWords;

  // check if it has a layout, find its limits, process it, and remove words
  words = processWordsWithin(expressionWords, "(", ")", (blockNumber) => {
    const blockIndex = Number(blockNumber);
    if (blockIndex >= 0 && blockIndex < blocks.length) {
      variable.layout = blocks[Number(blockNumber)].split(" ").join("");
    }
  });
  for (let word of words) {
    const openBracketIndex = word.indexOf("{");
    if (openBracketIndex >= 0) {
      word = word.slice(0, openBracketIndex);
    }
    const closeBracketIndex = word.indexOf("}");
    if (closeBracketIndex >= 0) {
      word = word.slice(closeBracketIndex + 1);
    }
    parseExpressionWord(word, variable, extraTypes);
  }
  processWordsWithin(words, "{", "}", (blockNumber) => {
    const blockIndex = Number(blockNumber);
    if (blockIndex >= 0 && blockIndex < blocks.length) {
      variable.block = readExpressions(
        blocks[blockIndex],
        {
          blocks,
          structs,
          extraTypes,
          expressionFilter: createVariablesFilter(extraTypes),
        },
      ).map((v) => {
        v.qualifier = variable.qualifier;
        return v;
      });
      variable.type = "block";
    }
  });

  return variable;
}

function fromPartialToFullVariable(variable: Partial<GLSLVariable>) {
  if (isGLSLVariable(variable)) {
    return variable;
  } else {
    throw new Error(
      "Unable to read a full GLSL variable: " + JSON.stringify(variable),
    );
  }
}

type GLSLPrecision = "highp" | "mediump" | "lowp";
function isGLSLPrecision(value: string): value is GLSLPrecision {
  return value === "highp" || value == "mediump" || value === "lowp";
}

type GLSLType =
  | "double"
  | "float"
  | "uint"
  | "int"
  | "bool"
  | "vec2"
  | "vec3"
  | "vec4"
  | "dvec2"
  | "dvec3"
  | "dvec4"
  | "uvec2"
  | "uvec3"
  | "uvec4"
  | "ivec2"
  | "ivec3"
  | "ivec4"
  | "bvec2"
  | "bvec3"
  | "bvec4"
  | "mat2"
  | "mat3"
  | "mat4"
  | "mat2x2"
  | "mat2x3"
  | "mat2x4"
  | "mat3x2"
  | "mat3x3"
  | "mat3x4"
  | "mat4x2"
  | "mat4x3"
  | "mat4x4"
  | "sampler2D"
  | "sampler3D"
  | "samplerCube"
  | "samplerCubeShadow"
  | "sampler2DShadow"
  | "sampler2DArray"
  | "sampler2DArrayShadow"
  | "isampler2D"
  | "isampler3D"
  | "isamplerCube"
  | "isampler2DArray"
  | "usampler2D"
  | "usampler3D"
  | "usamplerCube"
  | "usampler2DArray";

function isGLSLType(value: string): value is GLSLType {
  return (
    value === "double" ||
    value === "float" ||
    value === "uint" ||
    value === "int" ||
    value === "bool" ||
    value === "vec2" ||
    value === "vec3" ||
    value === "vec4" ||
    value === "dvec2" ||
    value === "dvec3" ||
    value === "dvec4" ||
    value === "uvec2" ||
    value === "uvec3" ||
    value === "uvec4" ||
    value === "ivec2" ||
    value === "ivec3" ||
    value === "ivec4" ||
    value === "bvec2" ||
    value === "bvec3" ||
    value === "bvec4" ||
    value === "mat2" ||
    value === "mat3" ||
    value === "mat4" ||
    value === "mat2x2" ||
    value === "mat2x3" ||
    value === "mat2x4" ||
    value === "mat3x2" ||
    value === "mat3x3" ||
    value === "mat3x4" ||
    value === "mat4x2" ||
    value === "mat4x3" ||
    value === "mat4x4" ||
    value === "sampler2D" ||
    value === "sampler3D" ||
    value === "samplerCube" ||
    value === "samplerCubeShadow" ||
    value === "sampler2DShadow" ||
    value === "sampler2DArray" ||
    value === "sampler2DArrayShadow" ||
    value === "isampler2D" ||
    value === "isampler3D" ||
    value === "isamplerCube" ||
    value === "isampler2DArray" ||
    value === "usampler2D" ||
    value === "usampler3D" ||
    value === "usamplerCube" ||
    value === "usampler2DArray"
  );
}

interface InputGLSLVariable extends GLSLVariable {
  qualifier: "uniform" | "in";
}

export function isInputVariable(
  variable: GLSLVariable,
): variable is InputGLSLVariable {
  return variable.qualifier !== "out";
}

interface OutputGLSLVariable extends GLSLVariable {
  qualifier: "out";
}

export function isOutputVariable(
  variable: GLSLVariable,
): variable is OutputGLSLVariable {
  return variable.qualifier === "out";
}
