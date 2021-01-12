import { GLSLVariable, parse as parseVariables } from "./parser.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.83.0/testing/asserts.ts";

Deno.test(
  "Can parse a single 'in' variable",
  () => {
    const code = `
    #version 300 es
    in vec4 a_position;

    void main() {
      gl_Position = a_position;
    }
    `;
    const variables = parseVariables(code);
    assertEquals(variables.length, 1);
    assertVariableIs(
      variables[0],
      { name: "a_position", type: "vec4", qualifier: "in" },
    );
  },
);

Deno.test(
  "Can parse a single 'out' variable",
  () => {
    const code = `
    #version 300 es
    precision highp float;
    out vec4 outColor;
     
    void main() {
      outColor = vec4(1, 0, 0.5, 1);
    }
    `;
    const variables = parseVariables(code);

    assertEquals(variables.length, 1);
    assertVariableIs(
      variables[0],
      { name: "outColor", type: "vec4", qualifier: "out" },
    );
  },
);

Deno.test(
  "Can parse uniform variables",
  () => {
    const code = `
    #version 300 es
    in vec2 a_position;
    uniform vec2 u_resolution;
    void main() {
      vec2 zeroToOne = a_position / u_resolution;
      vec2 zeroToTwo = zeroToOne * 2.0;
      vec2 clipSpace = zeroToTwo - 1.0;
    
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    }
    `;
    const variables = parseVariables(code);

    assertEquals(variables.length, 2);
    assertVariableIs(
      variables[1],
      { name: "u_resolution", type: "vec2", qualifier: "uniform" },
    );
  },
);

Deno.test(
  "Can parse a mix of uniform, out and in variables",
  () => {
    const code = `
    #version 300 es

    in vec4 a_position;
    in vec4 a_color;
    
    uniform mat4 u_matrix;
    
    out vec4 v_color;
    
    void main() {
      gl_Position = u_matrix * a_position;
    
      v_color = a_color;
    }
    `;
    const variables = parseVariables(code);

    assertEquals(variables.length, 4);
    assertVariableIs(
      variables[0],
      { name: "a_position", type: "vec4", qualifier: "in" },
    );
    assertVariableIs(
      variables[1],
      { name: "a_color", type: "vec4", qualifier: "in" },
    );
    assertVariableIs(
      variables[2],
      { name: "u_matrix", type: "mat4", qualifier: "uniform" },
    );
    assertVariableIs(
      variables[3],
      { name: "v_color", type: "vec4", qualifier: "out" },
    );
  },
);

Deno.test(
  "Can parse sampler2D variables",
  () => {
    const code = `
    #version 300 es

    precision highp float;
    in vec2 v_texcoord;
    
    uniform sampler2D u_texture;
    
    out vec4 outColor;
    
    void main() {
      outColor = texture(u_texture, v_texcoord);
    }
        `;
    const variables = parseVariables(code);

    assertEquals(variables.length, 3);
    assertVariableIs(
      variables[0],
      { name: "v_texcoord", type: "vec2", qualifier: "in" },
    );
    assertVariableIs(
      variables[1],
      { name: "u_texture", type: "sampler2D", qualifier: "uniform" },
    );
    assertVariableIs(
      variables[2],
      { name: "outColor", type: "vec4", qualifier: "out" },
    );
  },
);

Deno.test(
  "Ignores multi-line comments",
  () => {
    const code = `
    #version 300 es

    /*
    in vec4 a_position;
    in vec4 a_color;
    
    uniform mat4 u_matrix;
    
    out vec4 v_color;
    */
    precision highp float;
    in vec2 v_texcoord;
    
    uniform sampler2D u_texture; /* uniform mat2 test; */
    
    out vec4 outColor;
    
    void main() {
      outColor = texture(u_texture, v_texcoord);
    }
        `;
    const variables = parseVariables(code);

    assertEquals(variables.length, 3);
    assertVariableIs(
      variables[0],
      { name: "v_texcoord", type: "vec2", qualifier: "in" },
    );
    assertVariableIs(
      variables[1],
      { name: "u_texture", type: "sampler2D", qualifier: "uniform" },
    );
    assertVariableIs(
      variables[2],
      { name: "outColor", type: "vec4", qualifier: "out" },
    );
  },
);

Deno.test(
  "Ignores single-line comments",
  () => {
    const code = `
    #version 300 es

    
    // in vec4 a_position;
    // in vec4 a_color;
    
    //uniform mat4 u_matrix;
    
    //out vec4 v_color;
  
    precision highp float;
    in vec2 v_texcoord;
    
    uniform sampler2D u_texture; // uniform mat2 test;
    
    out vec4 outColor;
    
    void main() {
      outColor = texture(u_texture, v_texcoord);
    }
        `;
    const variables = parseVariables(code);

    assertEquals(variables.length, 3);
    assertVariableIs(
      variables[0],
      { name: "v_texcoord", type: "vec2", qualifier: "in" },
    );
    assertVariableIs(
      variables[1],
      { name: "u_texture", type: "sampler2D", qualifier: "uniform" },
    );
    assertVariableIs(
      variables[2],
      { name: "outColor", type: "vec4", qualifier: "out" },
    );
  },
);

Deno.test(
  "Can parse variables with layout",
  () => {
    const code = `
    #version 300 es

    /**** Multiline
     * Comment
     * Just
     * To
     * Test
     **/
    precision highp float; /* this is a comment */
    layout(location = 0) in vec2 position; // yet another comment
    layout ( location = 2 ) in vec2 spaced;
    layout(location=1)in vec2 texcoord;
    layout(location=3 ) in vec2 texcoord_option;

    uniform sampler2D u_texture;
    
    out vec4 outColor;
    
    void main() {
      outColor = texture(u_texture, v_texcoord);
    }
    `;
    const variables = parseVariables(code);

    assertEquals(variables.length, 6);
    assertVariableIs(
      variables[0],
      {
        name: "position",
        type: "vec2",
        qualifier: "in",
        layout: "location=0",
      },
    );
    assertVariableIs(
      variables[1],
      {
        name: "spaced",
        type: "vec2",
        qualifier: "in",
        layout: "location=2",
      },
    );
    assertVariableIs(
      variables[2],
      {
        name: "texcoord",
        type: "vec2",
        qualifier: "in",
        layout: "location=1",
      },
    );
    assertVariableIs(
      variables[3],
      {
        name: "texcoord_option",
        type: "vec2",
        qualifier: "in",
        layout: "location=3",
      },
    );
    assertVariableIs(
      variables[4],
      { name: "u_texture", type: "sampler2D", qualifier: "uniform" },
    );
    assertVariableIs(
      variables[5],
      { name: "outColor", type: "vec4", qualifier: "out" },
    );
  },
);
Deno.test(
  "Can parse uniform buffers",
  () => {
    const code = `
    #version 300 es

    uniform ExampleBlock
    {
        float value;
        vec3  vector;
        mat4  matrix;
        float values[3];
        bool  boolean;
        int   integer;
    };
    
    void main()
    {
        gl_Position = projection * view * model * vec4(aPos, 1.0);
    }  
    `;
    const variables = parseVariables(code);
    assertEquals(variables.length, 1);
    assertEquals(typeof variables[0].block, "object");
    assertVariableIs(
      variables[0],
      { name: "ExampleBlock", type: "block", qualifier: "uniform" },
    );
    assert(variables[0].block);
    if (variables[0].block) {
      assertVariableIs(
        variables[0].block[0],
        { name: "value", type: "float", qualifier: "uniform" },
      );
      assertVariableIs(
        variables[0].block[1],
        { name: "vector", type: "vec3", qualifier: "uniform" },
      );
      assertVariableIs(
        variables[0].block[2],
        { name: "matrix", type: "mat4", qualifier: "uniform" },
      );
      assertVariableIs(
        variables[0].block[3],
        { name: "values", type: "float", amount: 3, qualifier: "uniform" },
      );
      assertVariableIs(
        variables[0].block[4],
        { name: "boolean", type: "bool", qualifier: "uniform" },
      );
      assertVariableIs(
        variables[0].block[5],
        { name: "integer", type: "int", qualifier: "uniform" },
      );
    } else {
      throw new Error("No block is present");
    }
  },
);
Deno.test(
  "Can parse uniform buffers with layout",
  () => {
    const code = `
    #version 300 es
    layout (location = 0) in vec3 aPos;
    
    layout (std140) uniform Matrices
    {
        mat4 projection;
        mat4 view;
    } some_local_name;
    
    uniform mat4 model;
    
    void main()
    {
        gl_Position = projection * view * model * vec4(aPos, 1.0);
    }  
    `;
    const variables = parseVariables(code);
    assertEquals(variables.length, 3);
    assertEquals(typeof variables[1].block, "object");
    assertVariableIs(
      variables[1],
      {
        name: "Matrices",
        type: "block",
        qualifier: "uniform",
        layout: "std140",
      },
    );
    if (variables[1].block) {
      assertVariableIs(
        variables[1].block[0],
        { name: "projection", type: "mat4", qualifier: "uniform" },
      );
      assertVariableIs(
        variables[1].block[1],
        { name: "view", type: "mat4", qualifier: "uniform" },
      );
    }
  },
);
Deno.test(
  "Can parse uniform buffers with structs",
  () => {
    const code = `
    #version 300 es

    precision highp float;
    struct Material
    {
        vec3 ambient;
        vec3 diffuse;
        vec3 specular;
        float shininess;
    };
    
    uniform PerScene
    {
        Material material;
    } u_perScene;  
    
    struct MaterialAlternative{
    	float shininess;
    	float specularReflection;
    	float diffuseReflection;
    	float opacity;
    };
    
    layout(std140) uniform MaterialBuffer{
      MaterialAlternative materials[12];
      bool useCommon;
    	Material common[12];
    };
    
    void main() {
      outColor = texture(u_texture, v_texcoord);
    }
        `;
    const variables = parseVariables(code);
    assertEquals(variables.length, 4);

    // PerScene
    assertEquals(typeof variables[0].block, "object");
    assertVariableIs(
      variables[0],
      {
        name: "PerScene",
        type: "block",
        qualifier: "uniform",
      },
    );
    if (variables[0].block) {
      assertEquals(variables[0].block.length, 1);
      assertVariableIs(
        variables[0].block[0],
        {
          name: "material",
          type: "struct",
          qualifier: "uniform",
          structName: "Material",
        },
      );
    }
    //  MaterialBuffer
    assertEquals(typeof variables[1].block, "object");
    assertVariableIs(
      variables[1],
      {
        name: "MaterialBuffer",
        type: "block",
        qualifier: "uniform",
        layout: "std140",
      },
    );
    if (variables[1].block) {
      assertEquals(variables[1].block.length, 3);
      assertVariableIs(
        variables[1].block[0],
        {
          name: "materials",
          type: "struct",
          qualifier: "uniform",
          structName: "MaterialAlternative",
          amount: 12,
        },
      );
      assertVariableIs(
        variables[1].block[1],
        {
          name: "useCommon",
          type: "bool",
          qualifier: "uniform",
        },
      );
      assertVariableIs(
        variables[1].block[2],
        {
          name: "common",
          type: "struct",
          qualifier: "uniform",
          structName: "Material",
          amount: 12,
        },
      );

      // STRUCTS
      //  Material Struct
      assertEquals(typeof variables[2].block, "object");
      assertVariableIs(
        variables[2],
        {
          name: "Material",
          type: "block",
          qualifier: "struct",
        },
      );
      if (variables[2].block) {
        assertEquals(variables[2].block.length, 4);
        assertVariableIs(
          variables[2].block[0],
          {
            name: "ambient",
            type: "vec3",
            qualifier: "struct",
          },
        );
        assertVariableIs(
          variables[2].block[1],
          {
            name: "diffuse",
            type: "vec3",
            qualifier: "struct",
          },
        );
        assertVariableIs(
          variables[2].block[2],
          {
            name: "specular",
            type: "vec3",
            qualifier: "struct",
          },
        );
        assertVariableIs(
          variables[2].block[3],
          {
            name: "shininess",
            type: "float",
            qualifier: "struct",
          },
        );
      }
      // MaterialAlternative struct
      assertEquals(typeof variables[3].block, "object");
      assertVariableIs(
        variables[3],
        {
          name: "MaterialAlternative",
          type: "block",
          qualifier: "struct",
        },
      );
      if (variables[3].block) {
        assertEquals(variables[3].block.length, 4);
        assertVariableIs(
          variables[3].block[0],
          {
            name: "shininess",
            type: "float",
            qualifier: "struct",
          },
        );
        assertVariableIs(
          variables[3].block[1],
          {
            name: "specularReflection",
            type: "float",
            qualifier: "struct",
          },
        );
        assertVariableIs(
          variables[3].block[2],
          {
            name: "diffuseReflection",
            type: "float",
            qualifier: "struct",
          },
        );
        assertVariableIs(
          variables[3].block[3],
          {
            name: "opacity",
            type: "float",
            qualifier: "struct",
          },
        );
      }
    }
  },
);

function assertVariableIs(
  variable: Partial<GLSLVariable>,
  {
    name,
    type,
    qualifier,
    amount = 1,
    isInvariant = false,
    isCentroid = false,
    layout = null,
    structName = null,
  }: {
    name: string;
    type: string;
    qualifier?: string;
    amount?: number;
    isInvariant?: false;
    isCentroid?: false;
    layout?: null | string;
    structName?: null | string;
  },
) {
  assertEquals(variable.name, name);
  assertEquals(variable.type, type);
  assertEquals(variable.qualifier, qualifier);
  assertEquals(variable.amount, amount);
  assertEquals(variable.isInvariant, isInvariant);
  assertEquals(variable.isCentroid, isCentroid);
  assertEquals(variable.layout, layout);
  assertEquals(variable.structName, structName);
}
