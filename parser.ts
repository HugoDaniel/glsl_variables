// Copyright 2021 Hugo Daniel Henriques Oliveira Gomes. All rights reserved.
// Licensed under the EUPL
/**
 * This function returns the list of parsed input/output variables in a shader
 * code string.
 * 
 * It returns the array of all variables processed. These
 * include the shader input and output variables as well as any structs 
 * declared on the shader. The structs might be useful if they are referenced
 * as a type in a Uniform Buffer Object. The structs are placed at the end of
 * the returned array.
 *
 * It works in three stages:
 *
 * 1. Remove comments from the shader (their contents might interfere w/ parser)
 * 2. Read and remove all blocks content - strings inside "(",")" and inside
 * "{","}" get removed and placed in an array to be used later. Their contents
 * get replaced by their index on the array.
 * 3. On this string read all expressions (these end with ';') and parse the 
 * possible variable declarations in them.
 * 
 * A bit of extra work is done between step 2 and 3 to handle structs and
 * their possible usage in Uniform Buffer Objects. 
 * 
 * @param code the string with the GLSL shader code to analyze and parse
 */
export function parse(code: string) {
  // All code blocks will be removed from the input "code" string
  // and their contents will be placed on this "blocks" array.
  // i.e.
  // "main() {outColor = texture(u_texture, v_texcoord); }" becomes:
  // "main() {0}"
  //
  // The number inside the block is the index of the "blocks" array where
  // the content was placed at. This means that "blocks[0]" will have
  // "outColor = texture(u_texture, v_texcoord); " as its content.
  const blocks: string[] = [];
  // The code string is placed in the "shaderCode" variable after removing all
  // macros this is useful because the macros content interferes with the way
  // that expressions are being read (by string splitting on ';').
  let shaderCode = code.split("\n").filter((line) =>
    !line.trim().startsWith("#")
  ).join("\n");
  // clear the content of comments, there is no need to process
  // them and their contents might interfere with the rest of the parser
  // (e.g. a comment can have code inside - that code should always be ignored)
  shaderCode = replaceBlocks(shaderCode, "//", "\n");
  shaderCode = shaderCode.split("//").join("");
  shaderCode = replaceBlocks(shaderCode, "/*", "*/");
  shaderCode = shaderCode.split("/**/").join("");
  // match the content inside { } and place it in the blocks array.
  shaderCode = replaceBlocks(
    shaderCode,
    "{",
    "}",
    // `Array.push()` returns the new length, in this operation the "match"
    // string content is being put in the "blocks" array, while the new length
    // is being transformed into a string to replace the previous content inside
    // the "{" "}" block; this new code string is returned by `replaceBlocks()`
    (match) => String(blocks.push(match) - 1),
  );
  // Get the content inside parenthesis ( ) and place it in the blocks array.
  // This has the same logic as the "{" "}" above. The whatever is between ( )
  // gets replaced by the index that it was placed in the "blocks" string array.
  shaderCode = replaceBlocks(
    shaderCode,
    "(",
    ")",
    (match) => String(blocks.push(match) - 1),
  );
  // Pass through the shader code and read all expressions that declare a
  // "struct". These variables are placed on the "structs" array, and are used
  // to get the new types to be considered when reading the code for shaders
  // inputs and outputs. A shader variable can be any of the common GLSL types
  // like int, float, vec3, vec4, etc... but also can be declared to be a
  // previously defined struct. On this pass all structs are read and parsed.
  const structs = readExpressions(
    shaderCode,
    { blocks, expressionFilter: expressionStructsFilter },
  );
  // Go through the structs found and return their name. This list of names is
  // then used to consider the possible types a variable can have.
  const extraTypes = structs.map((s) => s.name).filter((s) =>
    typeof s === "string"
  ) as string[];
  // The final pass is to read all expressions and look for variables on the
  // code. The `shaderCode` string at this stage is very different from the
  // original:
  // - it has no comments and no macros
  // - it has all blocks replaced by {number}
  // - it has all parenthesis contents replaced by (number)
  return (readExpressions(shaderCode, { blocks, extraTypes }).concat(structs))
    .map(
      // `readExpressions()` returns an array of Partial variables. This final
      // step goes through all of the parsed Partial variables and transforms
      // them into the expected `GLSLVariable` interface. This works as the
      // final validation on the values being returned.
      // `fromPartialToFullVariable()` throws an exception if a Partial
      // GLSLVariable does not have the necessary attributes.
      fromPartialToFullVariable,
    );
}

/**
 * This function reads the code and returns an array of found GLSLVariables.
 * This is a recursive function, it calls `readVariable()` to create a list of
 * `GLSLVariable`'s. The `readVariable()` function can call `readExpressions()`
 * if a block string needs to be parsed into expressions. Making this a
 * somewhat hidden recursive function.
 * Block strings with useful variable declarations to consider happen when 
 * declaring `structs` or Uniform Buffer Objects.
 * 
 * In the options argument object an `expressionFilter` can be set. This
 * filter function is used to remove all non-valid expressions from being
 * passed to the `readVariable`. By default it uses the
 * `expressionShaderIOFilter()` which is a function that considers only those
 * expressions that start with the strings "attribute", "uniform" or "layout"
 * or "in" or "out".
 * 
 * This function works with the following outline:
 * 1. split all lines and ignore comments and lines that start with "#"
 * 2. trim all expressions (split by the ';' char) and consider only those that
 * the provided filter allows.
 * 3. for each line that matched the previous point, parse it with the function
 * `readVariable()` - this function gets the list of words of the variable
 * declaration and produces a Partial `GLSLVariable` object.
 */
function readExpressions(
  code: string,
  {
    // By default filter expressions that declare IO variables.
    expressionFilter = expressionShaderIOFilter,
    // The list of strings on each code block (defined by a matching { })
    blocks = [],
    // The list of extra types declared on this shader that should be considered
    // a valid type when declaring variables.
    extraTypes = [],
  }: {
    expressionFilter?: (words: string[]) => boolean;
    blocks?: string[];
    extraTypes?: string[];
  },
) {
  return (
    code
      // Split the string into an array of stirng expressions, in GLSL these
      // end with the ';' char
      .split(";")
      // Split each expression into an array of words (this regex matches only
      // non-whitespace chars - transforming a string into an array of words)
      .map((expression) => expression.match(/\S+/g) || [])
      // consider only the expressions that match the provided filter
      // this by default filters expressions that declare variables
      .filter(expressionFilter)
      // transform each expression filtered above into a `GLSLVariable` object
      // this map(readVariable) does `string[][] => GLSLVariable[]`
      .map((expressionWords: string[]) =>
        // `readVariable()` is where the words of an expression string are
        // transformed into a GLSLVariable
        readVariable(expressionWords, { blocks, extraTypes })
      )
  );
}

/** Discard every expression that does not start with what can be a
 * variable declaration. This returns false for all list of strings that do not
 * start with the words: "uniform", "in", "out", "layout" and a "precision"
 * declaration big enough to be considered part of a variable declaration.
 */
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
      //
      (initialWord.includes("precision") && expressionWords.length > 3)
    )
  );
}

/**
 * This expression filter only considers list of words that start with the word
 * "struct". This is useful to parse only expressions that declare structs when
 * calling `readExpressions()`
 **/
function expressionStructsFilter(expressionWords: string[]) {
  if (expressionWords.length === 0) return false;
  return (expressionWords[0] === "struct");
}

/**
 * This is an expression filter creator, it returns a function that extends the
 * `expressionShaderIOFilter()` function to consider all common GLSL variable
 * declarations as well as those that are set with the types defined at the
 * provided `extraTypes` word list.
 * 
 * Example: If a struct is declared to be something like:
 * 
 *  struct Material
 *  {
 *    vec3 ambient;
 *    vec3 diffuse;
 *    vec3 specular;
 *    float shininess;
 *  };
 * 
 * Then a new variable could be declared like:
 *  
 *  uniform PerScene
 *  {
 *    Material material; // Notice the `Material` here being used as the type
 *  } u_perScene;
 * 
 * This function returns a function that extends the shader IO variables filter
 * so that it considers these variables too.
 **/
function createVariablesFilter(extraTypes: string[]) {
  return ((expressionWords: string[]) => {
    if (expressionWords.length === 0) return false;
    return (isGLSLType(expressionWords[0]) ||
      extraTypes.includes(expressionWords[0]) ||
      expressionShaderIOFilter(expressionWords));
  });
}

/**
 * This function reads a string and replaces the contents between the
 * `blockStart` and `blockEnd` strings. The contents between these two
 * delimiters can be changed with the `replacer()` string passed as argument.
 * 
 * All delimiters are considered. The `replacer()` function is called once per
 * each contained string found. This means that the `code` string can have
 * several delimiters because `replaceBlocks()` will consider them all.
 * 
 * It returns a new `code` string with the replacements made in it. This
 * function does not change the argument `code` string. It creates a new one.
 */
function replaceBlocks(
  code: string,
  blockStart: string,
  blockEnd: string,
  replacer: (match: string) => string = () => "",
): string {
  let result = code; // All changes are accumulated into this `result` variable.
  // Get an array with all the substrings delimited by the `blockStart` string.
  const blocks = code.split(blockStart);
  // Run through all the strings and replace each of their contents up until the
  // location of the `blockEnd` string.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]; // `b` is the current substring being considered
    const endIndex = b.indexOf(blockEnd);
    // Call `replace()` only if the `blockEnd` string is found on this substring
    if (endIndex > 0) {
      // Call the `replacer()` function. This is standard String.replace() API.
      result = result.replace(b.slice(0, endIndex), replacer);
    }
  }
  // The new string with the replacements done in it. If no replaces were
  // performed this will be the original `code` string from the argument.
  return result;
}

/**
 * The valid GLSL variable `Qualifier`s to consider. For this parser use cases
 * these will be the strings "in", "uniform" and "out", which correspond to the
 * WebGL2 I/O variables.
 */
type Qualifier = "in" | "uniform" | "out";
/** A type-guard that will make sure a given value is of the type Qualifier */
function isQualifier(value: unknown): value is Qualifier {
  return (
    typeof value === "string" &&
    (value === "in" || value === "uniform" || value === "out")
  );
}

/**
 * The type of a GLSL variable that is successfully parsed.
 * It has the most common attributes that a variable can have in GLSL.
 * 
 * This is a recursive interface. It is being used in its declaration as the
 * `block` array type.
 */
export interface GLSLVariable {
  // The "struct" qualifier is used when declaring a struct; in which case the
  // type will be "block" and the variables present on the struct present on
  // the "block" array
  qualifier: Qualifier | "struct";
  // The type of this variable. It is "struct" when the variable is using a
  // struct, in which case the name of the struct being used is passed on the
  // attribute "structName".
  type: GLSLType | "block" | "struct";
  name: string;
  // Amount is always 1 except for the cases where this variable is an array.
  // If this variable is an array `amount` contains the size of it.
  // i.e. for `float values[3];` amount will be 3.
  amount: number;
  // Invariant and Centroid are special variable attributes that GLSL allows
  // It is important to consider them because they can have special IO
  // considerations
  isInvariant: boolean;
  isCentroid: boolean;
  // If a variable has the layout defined this attribute will contain the
  // string used to set the layout
  // i.e. `layout(location=1) in vec2 texcoord;` will make layout have the
  // string "location=1". Strings have their spaces removed, this means that
  // something like "layout( location = 3 )" will be placed here as
  // "location=3".
  layout: string | null;
  // The precision modifier present on the variable declaration. This is not
  // the precision set at the shader or block level. This is the precision
  // modifier for a single variable declaration. Can be null if none is found.
  precision: GLSLPrecision | null;
  // If this variable is declaring a block (uniform buffer objects, or structs),
  // then all the variables found inside the block will be available in this
  // array.
  block: GLSLVariable[] | null;
  // If this variable uses a struct the `structName` will contain the name of
  // the struct being used. This is useful to allow the struct attributes to be
  // found by searching for the struct with this name on the array of all
  // `GLSLVariable`'s that is returned by `parse()`.
  structName: string | null;
}

/**
 * Type-guard for the `GLSLVariable` interface. It makes sure that a given
 * unknown value is a GLSLVariable interface.
 */
function isGLSLVariable(value: unknown): value is GLSLVariable {
  return (
    // A GLSLVariable must be an object
    typeof value === "object" &&
    // it cannot be null
    value !== null &&
    // it has got to have the "qualifier" attribute defined
    "qualifier" in value &&
    // and it has to be either a valid Qualifier type or the "struct" string
    ((value as GLSLVariable).qualifier === "struct" ||
      isQualifier((value as GLSLVariable).qualifier)) &&
    // it has got to have the "type" attribute defined
    "type" in value &&
    // and it has to be either a valid GLSLType type or the "block" or "struct"
    // strings
    ((value as GLSLVariable).type === "block" ||
      (value as GLSLVariable).type === "struct" ||
      isGLSLType((value as GLSLVariable).type)) &&
    // it has got to have the "name" attribute defined with the type "string"
    "name" in value &&
    typeof (value as GLSLVariable).name === "string" &&
    // it has got to have the "amount" attribute defined with the type "number"
    // and it is not a NaN
    "amount" in value &&
    typeof (value as GLSLVariable).amount === "number" &&
    !isNaN((value as GLSLVariable).amount) &&
    // the "isVariant" attribute must defined with the type "boolean"
    "isInvariant" in value &&
    typeof (value as GLSLVariable).isInvariant === "boolean" &&
    // the "isCentroid" attribute must defined with the type "boolean"
    "isCentroid" in value &&
    typeof (value as GLSLVariable).isCentroid === "boolean" &&
    // the "layout" attribute must defined and be either null or a string
    "layout" in value &&
    ((value as GLSLVariable).layout === null ||
      typeof (value as GLSLVariable).layout === "string") &&
    // the "precision" attribute must defined and be either null or a valid
    // precision string
    "precision" in value &&
    ((value as GLSLVariable).precision === null ||
      isGLSLPrecision((value as GLSLVariable).precision as string))
  );
}

/**
 * This function changes the provided `variable` passed on the 2nd argument.
 * It reads the `word` passed as argument and places it in the correct 
 * `variable` attribute.
 * 
 * i.e. for the `word` "vec4", this function will place it on the
 * `variable.type` attribute
 * 
 * It can place a `word` string in the following attributes of a `GLSLVariable`:
 * - qualifier
 * - structName
 * - type (it also considers the values present on the `extraTypes` array)
 * - amount
 * - isCentroid
 * - isInvariant
 * - precision
 * - name
 * 
 * If a valid `variable` attribute is not found the `variable` is returned
 * unchanged. 
 */
function parseExpressionWord(
  word: string,
  variable: Partial<GLSLVariable>,
  extraTypes: string[] = [],
): Partial<GLSLVariable> {
  // Set the word as the `variable` qualifier if it was not set before.
  if (!variable.qualifier && (isQualifier(word) || word === "struct")) {
    variable.qualifier = word;
    return variable;
  }
  // Check if the word is one of the provided `extraTypes`. If so then
  // set it as the structName and a type ("struct"). Setting a type prevents
  // the `type` to be set further bellow.
  if (!variable.structName && extraTypes.includes(word)) {
    // "struct" is a special type that indicates that this variable is using
    // a previously declared struct as a type. The name of the struct being
    // used is set as the `structName`.
    variable.type = "struct";
    variable.structName = word;
    return variable;
  }
  // Set the word as the `variable` type if it was not set before.
  if (!variable.type && isGLSLType(word)) {
    variable.type = word;
    return variable;
  }
  // Check if this word is an array and set the number and name attributes.
  // TODO: this will not work for array declarations that have a space: [ 12 ]
  const bracketIndex = word.indexOf("[");
  if (bracketIndex >= 0) {
    // Convert the contents of the brackets to a Number
    variable.amount = Number(
      word.slice(bracketIndex + 1, word.indexOf("]")),
    );
    // Set the variable name if it is attached to the bracket, i.e. values[2]
    if (bracketIndex > 0) {
      variable.name = word.slice(0, bracketIndex);
    }
    return variable;
  }
  // Set the `variable` isCentroid boolean to true if the word is "centroid".
  if (!variable.isCentroid && word === "centroid") {
    variable.isCentroid = true;
    return variable;
  }
  // Set the `variable` isInvariant boolean to true if the word is "invariant".
  if (!variable.isInvariant && word === "invariant") {
    variable.isInvariant = true;
    return variable;
  }
  // Check if the word is a precision modifier and set the `variable` precision.
  if (!variable.precision && isGLSLPrecision(word)) {
    variable.precision = word;
    return variable;
  }
  // If none of the above matched any attribute, then check if the name was set
  // and place the word as the variable name if the name is still to be defined.
  if (!variable.name) {
    variable.name = word;
    return variable;
  }
  // Reaching here means that no modification was done, return the variable
  // as is
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

/**
 * This function calls the provided `processor()` function with the list of
 * words from `expressionWords` that show up between the `leftLimit` and
 * `rightLimit` strings.
 * 
 * It does not modify any of the arguments. The `processor()` function provided
 * is expected to have its own context to operate.
 * 
 * Similar to the `replaceBlocks()`, this function takes the consideration that
 * the provided `expressionWords` string array is currently being processed and
 * returns an adjusted array to have the word in it without the limiters.
 * 
 * This function does not go through all the occurrences of the limits. It works
 * only on the first left/right limit strings found.
 * 
 * It returns an adjusted list of words by adding those found immediately 
 * before the `leftLimit` string and/or immediately after the `rightLimit`
 * string.
 */
function processWordsWithin(
  expressionWords: string[],
  leftLimit: string,
  rightLimit: string,
  processor: (input: string[]) => void,
): string[] {
  // Result is the new `expressionWords` array. Adjusted to contain the remains
  // of the words found next to the left/right limit strings.
  const result = [];
  // The processor input is the array of words that is passed to the provided
  // `processor` function.
  let processorInput: string[] = [];
  // This function starts by finding the indices of the left/right limit strings
  // This is useful because they are used a lot during the rest of this code.
  const startIndex = expressionWords.findIndex((w) => w.includes(leftLimit));
  const endIndex = expressionWords.findIndex((w) => w.includes(rightLimit));
  // Check if the this `expressionWords` list has the left/right limit strings.
  if (startIndex === -1 && endIndex === -1) {
    // Return the original word list unchanged.
    // The limit strings were not found.
    return expressionWords;
  }
  // The last word is the word where first occurrence of the rightLimit string
  // was found.
  const lastWord = expressionWords[endIndex];

  // The last word can be empty, in which case there is nothing to do by this
  // function.
  if (typeof lastWord === "undefined" || lastWord.length === 0) {
    // Return the original word list unchanged.
    return expressionWords;
  }
  // The case where the limits happen both on the same word.
  if (startIndex === endIndex) {
    // Set the input to be the slice of the word between the limit strings.
    processorInput.push(
      lastWord.slice(
        lastWord.indexOf(leftLimit) + 1,
        lastWord.indexOf(rightLimit),
      ),
    );
  } else {
    // The case where the limits happen in different words needs to consider
    // all the words between the word where the leftLimit is present, up until
    // the word where the rightLimit is found.

    // Start by placing on the `processorInput` array the contents of the first
    // word found that show up after the `leftLimit` position.
    // e.g. For a leftLimit of "(" the first word of this:
    // `something(content1 content2 content3)something` would be the string
    // "something(content1", of which this code starts by considering the
    // part that shows after leftLimit, namely the "content1" string.
    processorInput.push(expressionWords[startIndex].slice(
      expressionWords[startIndex].indexOf(leftLimit) + 1,
    ));
    // Merge on the processorInput all words that show up between the limiters.
    processorInput = processorInput.concat(
      expressionWords.slice(startIndex + 1, endIndex),
    );
    // As the example for the first word above. This will place on the
    // processInput the contents of the last word up until the right limiter.
    processorInput.push(lastWord.slice(
      0,
      lastWord.indexOf(rightLimit),
    ));
  }
  // Calls the `processor()` on the list of words found within the
  // `leftLimit` and `rightLimit`
  processor(processorInput);
  // Look at the last word, and clear the `rightLimit` string from it.
  if (lastWord.indexOf(rightLimit) < lastWord.length - 1) {
    result.push(lastWord.slice(lastWord.indexOf(rightLimit) + 1));
  }
  // Adjust the expressionWords to include the eventual words that were outside
  // the left/right limiters but attached to them:
  // e.g. for `something1(content1 content2 content3)something2` this would be
  // the words "something1" and "something2" for the limiters "(" and ")".
  return result.concat(expressionWords.slice(endIndex + 1));
}

/**
 * This function reads a GLSLVariable from an expression (split in words)
 * provided by the `expressionWords` array.
 * 
 * It starts by creating an empty Partial GLSLVariable and works in 3 sequential
 * steps:
 * 1. Process the empty variable layout()
 * 2. Set the empty variable attributes by processing each word with the
 * function `parseExpressionWord()` - `extraTypes` are considered here.
 * 3. Process the variable block { } if it has one - reads the corresponding
 * string on the provided `blocks` array.
 * 
 * It throws an exception if it has a block and the block variables are not
 * well formed.
 * 
 * It assumes that the blocks were preprocessed before for the limiters:
 * - "(" ")"
 * - "{" "}"
 * 
 * Returns the Partial `GLSLVariable` that could be read from the
 * `expressionWords` array.
 */
function readVariable(
  expressionWords: string[],
  {
    blocks = [],
    extraTypes = [],
  }: {
    blocks: string[];
    extraTypes?: string[];
  },
): Partial<GLSLVariable> {
  // Start with an empty variable and fill it on this function.
  const variable: Partial<GLSLVariable> = createPartialVariable();
  // Manipulation and reassignment of the list of words on the expression
  // can happen during parsing. Use a different variable for these operations.
  let words = expressionWords;

  // Part 1: Check if it has a layout, set the "layout" variable contents to be
  // the string found inside the parenthesis.
  words = processWordsWithin(expressionWords, "(", ")", (blockNumber) => {
    // Read the block number where the contents of the "(" ")" were placed
    // (after being preprocessed outside this function).
    const blockIndex = Number(blockNumber);
    if (!isNaN(blockIndex) && blockIndex >= 0 && blockIndex < blocks.length) {
      // Set the layout attribute to be the string inside the ( ).
      // This string will have all its spaces removed, this means that
      // "layout( location = 2 )" will translate to "location=2".
      variable.layout = blocks[Number(blockNumber)].split(" ").join("");
    }
  });
  // Part 2: Read all words and place them on the corresponding variable
  // attributes. Words that don't match a particular variable attribute are
  // ignored.
  for (let word of words) {
    // Do some clean-up before
    // Remove the { bracket from the word if it has one
    const openBracketIndex = word.indexOf("{");
    if (openBracketIndex >= 0) {
      word = word.slice(0, openBracketIndex);
    }
    // Remove the } bracket from the word if it has one
    const closeBracketIndex = word.indexOf("}");
    if (closeBracketIndex >= 0) {
      word = word.slice(closeBracketIndex + 1);
    }
    // Set the variable attribute that matches this word content.
    // i.e. if the word is "float" it will go into the "type" attribute
    parseExpressionWord(word, variable, extraTypes);
  }
  // Part 3: Process the block if this expression has one. This is where
  // recursion happens, because all variables inside the block will be
  // processed with `readExpressions()` which splits the block into expressions
  // and calls `readVariables()` for each of those expressions.
  processWordsWithin(words, "{", "}", (blockNumber) => {
    // Read the block number where the contents of the "{" "}" were placed
    // (this is assumed to have been preprocessed before calling this function).
    const blockIndex = Number(blockNumber);
    if (!isNaN(blockIndex) && blockIndex >= 0 && blockIndex < blocks.length) {
      // Recursively split the block expressions and read its variables:
      variable.block = readExpressions(
        blocks[blockIndex],
        {
          blocks,
          extraTypes,
          // Only consider expressions that are GLSL variables. These GLSL
          // variables can be declared with any valid GLSL type like
          // "float", "vec3", etc... but can also be declared with any of the
          // names present on the "extraTypes" array. This ensures the that
          // filter will be able to look for variables that are using a
          // previously declared struct.
          expressionFilter: createVariablesFilter(extraTypes),
        },
      ).map((v): GLSLVariable => {
        // In GLSL, variables inside block declarations inherit the block
        // qualifier if they don't define their own qualifier.
        if (!v.qualifier) {
          v.qualifier = variable.qualifier;
        }
        // Only proceed if the variable read on the block is a valid full
        // `GLSLVariable`
        if (isGLSLVariable(v)) {
          return v;
        } else {
          throw new Error(`Invalid block variable: ${JSON.stringify(v)}`);
        }
      });
      // Variables that declare a block are always set to have the fictitious
      // type "block". This is used by this parser to specify variables that
      // are blocks.
      variable.type = "block";
    }
  });
  // Return the Partial<GLSLVariable> filled with that was possible to read
  return variable;
}

/**
 * This function applies the `isGLSLVariable()` type-guard to a variable and
 * throws an exception if the variable is not a valid full `GLSLVariable`.
 */
function fromPartialToFullVariable(variable: Partial<GLSLVariable>) {
  if (isGLSLVariable(variable)) {
    return variable;
  } else {
    throw new Error(
      "Unable to read a full GLSL variable: " + JSON.stringify(variable),
    );
  }
}

/**
 * The possible precision modifier strings of a GLSL variable.
 * These values were taken from the GLSL 300 spec.
 **/
type GLSLPrecision = "highp" | "mediump" | "lowp";
function isGLSLPrecision(value: string): value is GLSLPrecision {
  return value === "highp" || value == "mediump" || value === "lowp";
}

/**
 * The possible "type"'s of a GLSL variable.
 * These were taken from the spec GLSL 300 spec.
 **/
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

/**
 * A type-guard for the GLSLType.
 * It returns true if the string matches any string considered a valid
 * `GLSLType`
 **/
function isGLSLType(value: string): value is GLSLType {
  switch (value) {
    case "double":
    case "float":
    case "uint":
    case "int":
    case "bool":
    case "vec2":
    case "vec3":
    case "vec4":
    case "dvec2":
    case "dvec3":
    case "dvec4":
    case "uvec2":
    case "uvec3":
    case "uvec4":
    case "ivec2":
    case "ivec3":
    case "ivec4":
    case "bvec2":
    case "bvec3":
    case "bvec4":
    case "mat2":
    case "mat3":
    case "mat4":
    case "mat2x2":
    case "mat2x3":
    case "mat2x4":
    case "mat3x2":
    case "mat3x3":
    case "mat3x4":
    case "mat4x2":
    case "mat4x3":
    case "mat4x4":
    case "sampler2D":
    case "sampler3D":
    case "samplerCube":
    case "samplerCubeShadow":
    case "sampler2DShadow":
    case "sampler2DArray":
    case "sampler2DArrayShadow":
    case "isampler2D":
    case "isampler3D":
    case "isamplerCube":
    case "isampler2DArray":
    case "usampler2D":
    case "usampler3D":
    case "usamplerCube":
    case "usampler2DArray":
      return true;
    default:
      return false;
  }
}

/**
 * A subset of the `GLSLVariable` that only allows the strings
 * "uniform" and "in" as qualifiers
 **/
export interface InputGLSLVariable extends GLSLVariable {
  qualifier: "uniform" | "in";
}

/**
 * This function returns true if a GLSLVariable is not an "out" variable.
 **/
export function isInputVariable(
  variable: GLSLVariable,
): variable is InputGLSLVariable {
  return variable.qualifier !== "out";
}

/**
 * A subset of the `GLSLVariable` that only allows the string "out" as a
 * qualifier
 **/
export interface OutputGLSLVariable extends GLSLVariable {
  qualifier: "out";
}

/**
 * This function returns true if a GLSLVariable is set as an "out" variable.
 **/
export function isOutputVariable(
  variable: GLSLVariable,
): variable is OutputGLSLVariable {
  return variable.qualifier === "out";
}
