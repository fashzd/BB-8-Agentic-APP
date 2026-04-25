const test = require("node:test");
const assert = require("node:assert/strict");
const { AIService, buildAssistantReply, buildLocalSourceReply, buildResponseInput } = require("../src/main/services/aiService");

test("ai service reports missing api key status clearly", () => {
  const service = new AIService({ apiKey: "", model: "gpt-5-mini" });
  const status = service.getStatus();

  assert.equal(status.configured, false);
  assert.equal(status.model, "gpt-5-mini");
  assert.equal(status.mode, "missing-api-key");
  assert.ok(Array.isArray(status.availableModels));
  assert.ok(status.availableModels.some((option) => option.value === "gpt-4o-mini"));
});

test("response input includes memory and source context with multi-source instructions", () => {
  const input = buildResponseInput({
    text: "Summarize the plan",
    sessionMessages: [
      { role: "user", text: "We are building BB-8." },
      { role: "assistant", text: "I can help with that." }
    ],
    notionContext: [
      {
        title: "Roadmap",
        url: "https://example.com/roadmap",
        content: "Phase 1 done. Phase 2 is AI integration."
      },
      {
        title: "Spec",
        path: "SPEC.md",
        content: "The product should stay concise and use selected sources."
      }
    ],
    memoryState: {
      projectSummary: "BB-8 is a desktop AI assistant built with Electron and React.",
      userPreferences: {
        tone: "concise",
        codingStyle: "modular",
        workflows: "explain briefly, then implement"
      }
    }
  });

  assert.equal(input[0].role, "developer");
  assert.match(input[0].content[0].text, /Project summary/);
  assert.match(input[0].content[0].text, /Knowledge sources count: 2/);
  assert.match(input[0].content[0].text, /Knowledge sources/);
  assert.match(input[0].content[0].text, /Keep responses concise by default/);
  assert.match(input[0].content[0].text, /use every provided source/);
  assert.equal(input[1].content[0].type, "input_text");
  assert.equal(input[2].content[0].type, "output_text");
  assert.equal(input.at(-1).role, "user");
  assert.equal(input.at(-1).content[0].text, "Summarize the plan");
});

test("assistant reply falls back to structured output content", () => {
  const reply = buildAssistantReply(
    {
      output: [
        {
          content: [
            {
              type: "output_text",
              text: "Yes, I can see the source."
            }
          ]
        }
      ]
    },
    []
  );

  assert.equal(reply.text, "Yes, I can see the source.");
});

test("assistant reply falls back gracefully when the model returns no text", () => {
  const reply = buildAssistantReply({}, [{ title: "AGENTS.md", path: "AGENTS.md" }]);

  assert.match(reply.text, /I can see AGENTS\.md/);
});

test("local source reply counts all sources deterministically", () => {
  const reply = buildLocalSourceReply("how many files do you see in sources?", [
    { title: "AGENTS.md" },
    { title: "README.md" },
    { title: "PRODUCT_SPEC.md" }
  ]);

  assert.match(reply.text, /3 source files/);
  assert.match(reply.text, /AGENTS\.md, README\.md, PRODUCT_SPEC\.md/);
});

test("local source reply summarizes each source deterministically", () => {
  const reply = buildLocalSourceReply("read all the files and write me 3-5 sentences about each", [
    {
      title: "AGENTS.md",
      content: "# AGENTS\n\nDefines the agent workflow and editing rules."
    },
    {
      title: "README.md",
      content: "# README\n\nExplains the project overview and how to run it."
    }
  ]);

  assert.match(reply.text, /AGENTS\.md/);
  assert.match(reply.text, /README\.md/);
  assert.match(reply.text, /agent behavior and workflow rules/);
  assert.match(reply.text, /project overview and usage/);
});

test("local source reply also catches plain summarize each file phrasing", () => {
  const reply = buildLocalSourceReply("summarize each file", [
    {
      title: "AGENTS.md",
      content: "# AGENTS\n\nDefines the agent workflow and editing rules."
    },
    {
      title: "README.md",
      content: "# README\n\nExplains the project overview and how to run it."
    }
  ]);

  assert.ok(reply);
  assert.match(reply.text, /AGENTS\.md/);
  assert.match(reply.text, /README\.md/);
});

test("local source reply answers install questions from readme content", () => {
  const reply = buildLocalSourceReply("how to install the app?", [
    {
      title: "README.md",
      content: "# README\n\nInstall dependencies with npm install. Start the app with npm run dev."
    },
    {
      title: "AGENTS.md",
      content: "# AGENTS\n\nDefines the workflow."
    }
  ]);

  assert.ok(reply);
  assert.match(reply.text, /README\.md/);
  assert.match(reply.text, /npm install/i);
});

test("local source reply targets readme when user says check readme", () => {
  const reply = buildLocalSourceReply("check readme", [
    {
      title: "README.md",
      content: "# README\n\nInstall dependencies with npm install. Start the app with npm run dev."
    },
    {
      title: "AGENTS.md",
      content: "# AGENTS\n\nDefines the workflow."
    }
  ]);

  assert.ok(reply);
  assert.match(reply.text, /^README\.md/m);
  assert.match(reply.text, /Summary:/);
});

test("local source reply answers run questions from readme run section", () => {
  const reply = buildLocalSourceReply("how to run the app?", [
    {
      title: "README.md",
      content: "# README\n\n## Run The App\n\nRun npm install first.\nThen use npm run dev."
    },
    {
      title: "AGENTS.md",
      content: "# AGENTS\n\nDefines the workflow."
    }
  ]);

  assert.ok(reply);
  assert.match(reply.text, /README\.md/);
  assert.match(reply.text, /Run The App/);
  assert.match(reply.text, /npm run dev/i);
});

test("local source reply treats read-this-and-tell-me-how prompts as source questions", () => {
  const reply = buildLocalSourceReply("read the readme file and tell me how to install the app", [
    {
      title: "README.md",
      content:
        "# T&C Analyzer\n\n## Running the Pipeline (Python)\n\n```bash\ncd pipeline\npip install -r requirements.txt\npython main.py test_tcs/instagram_tc.txt\n```"
    },
    {
      title: "AGENTS.md",
      content: "# AGENTS\n\nDefines the workflow."
    }
  ]);

  assert.ok(reply);
  assert.doesNotMatch(reply.text, /- Focus:/);
  assert.match(reply.text, /^README\.md/m);
  assert.match(reply.text, /cd pipeline/i);
  assert.match(reply.text, /pip install -r requirements\.txt/i);
});
