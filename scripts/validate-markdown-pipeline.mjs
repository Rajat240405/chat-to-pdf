// scripts/validate-markdown-pipeline.mjs
// Run: node scripts/validate-markdown-pipeline.mjs
//
// Exercises markdownToHtml() across all supported markdown feature classes
// and prints the rendered HTML so we can confirm output is correct.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

async function markdownToHtml(content) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeHighlight, { detect: true, ignoreMissing: true })
    .use(rehypeStringify, { closeSelfClosing: false })
    .process(content);
  return String(result);
}

// ── Test cases ──────────────────────────────────────────────────────────────

const tests = [
  {
    name: "Headings H1–H4",
    md: `# H1 Heading\n## H2 Heading\n### H3 Heading\n#### H4 Heading`,
  },
  {
    name: "Bold, italic, strikethrough",
    md: `**bold text** and *italic text* and ~~strikethrough text~~ and ***bold italic***`,
  },
  {
    name: "Inline code",
    md: `Use \`useState\` and \`useEffect\` for React hooks.`,
  },
  {
    name: "Fenced code block — TypeScript",
    md: "```typescript\ninterface Config {\n  clusterSize: number;\n  securityMode: 'mutual-tls' | 'noise';\n}\n```",
  },
  {
    name: "Fenced code block — Python",
    md: "```python\n# merge.py\nfrom dataclasses import dataclass\n\n@dataclass\nclass StateVector:\n    version: dict[str, int]\n\n    def merge(self, other: 'StateVector') -> 'StateVector':\n        return StateVector({**self.version})\n```",
  },
  {
    name: "Fenced code block — SQL",
    md: "```sql\nSELECT table_name, COUNT(*) AS fk_count\nFROM information_schema.table_constraints\nWHERE constraint_type = 'FOREIGN KEY'\n  AND table_schema = 'public'\nGROUP BY table_name\nORDER BY fk_count DESC;\n```",
  },
  {
    name: "Unlabelled code block (auto-detect)",
    md: "```\nconst x = require('module');\nmodule.exports = x;\n```",
  },
  {
    name: "Table with alignment",
    md: `| Left | Centre | Right |\n|:-----|:------:|------:|\n| A    | B      | C     |\n| **bold** | \`code\` | [link](http://example.com) |`,
  },
  {
    name: "Nested unordered list (3 levels)",
    md: `- Item A\n  - Nested B\n    - Deep C\n  - Nested D\n- Item E`,
  },
  {
    name: "Nested ordered list",
    md: `1. First\n   1. Sub-first\n   2. Sub-second\n2. Second\n3. Third`,
  },
  {
    name: "Task list (GFM checkboxes)",
    md: `- [x] Completed task\n- [ ] Pending task\n- [x] Another done`,
  },
  {
    name: "Blockquote — single line",
    md: `> This is a blockquote with **bold** and \`code\`.`,
  },
  {
    name: "Blockquote — multi-paragraph",
    md: `> First paragraph of the blockquote.\n>\n> Second paragraph still inside the blockquote.`,
  },
  {
    name: "Blockquote — starts with > (no space)",
    md: `>Text without space after angle bracket.`,
  },
  {
    name: "Horizontal rule variants",
    md: `---\n\n***\n\n___`,
  },
  {
    name: "Image",
    md: `![Alt text for an image](https://example.com/image.png "Optional title")`,
  },
  {
    name: "Autolink (GFM bare URL)",
    md: `Visit https://example.com or email test@example.com directly.`,
  },
  {
    name: "Link — external",
    md: `[OpenAI documentation](https://openai.com/docs)`,
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    const html = await markdownToHtml(test.md);
    const trimmed = html.trim();
    
    // Basic sanity: non-empty, starts with <, no [object Object]
    const isEmpty = trimmed.length === 0;
    const noHtml = !trimmed.startsWith("<");
    const hasObjectStr = trimmed.includes("[object Object]");
    
    if (isEmpty || noHtml || hasObjectStr) {
      console.log(`❌ FAIL: ${test.name}`);
      console.log(`   HTML: ${trimmed.slice(0, 120)}`);
      failed++;
    } else {
      console.log(`✅ PASS: ${test.name}`);
      // Print first 200 chars of HTML for inspection
      console.log(`   → ${trimmed.slice(0, 200).replace(/\n/g, " ")}`);
      passed++;
    }
  } catch (err) {
    console.log(`💥 ERROR: ${test.name} — ${err.message}`);
    failed++;
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
console.log("─".repeat(60));

// ── Feature-specific assertions ──────────────────────────────────────────────

console.log("\n=== Feature assertions ===\n");

const assertions = [
  {
    name: "Strikethrough produces <del> element",
    md: "~~deleted~~",
    check: (h) => h.includes("<del>"),
  },
  {
    name: "Task list produces <input type=\"checkbox\" disabled>",
    md: "- [x] Done\n- [ ] Todo",
    check: (h) => h.includes('type="checkbox"') && h.includes("disabled"),
  },
  {
    name: "Nested list produces nested <ul> elements",
    md: "- A\n  - B\n    - C",
    check: (h) => (h.match(/<ul>/g) || []).length >= 2,
  },
  {
    name: "Table produces <thead> and <tbody>",
    md: "| A | B |\n|---|---|\n| 1 | 2 |",
    check: (h) => h.includes("<thead>") && h.includes("<tbody>"),
  },
  {
    name: "Image produces <img> with src and alt",
    md: "![alt](https://example.com/img.png)",
    check: (h) => h.includes("<img") && h.includes('src="') && h.includes('alt="'),
  },
  {
    name: "Multi-paragraph blockquote stays inside one <blockquote>",
    md: "> Para one.\n>\n> Para two.",
    check: (h) => {
      const opens = (h.match(/<blockquote>/g) || []).length;
      const closes = (h.match(/<\/blockquote>/g) || []).length;
      return opens === 1 && closes === 1;
    },
  },
  {
    name: "TypeScript block has hljs class tokens",
    md: "```typescript\nconst x: string = 'hello';\n```",
    check: (h) => h.includes("hljs-") && h.includes("hljs-keyword"),
  },
  {
    name: "Python block has hljs class tokens",
    md: "```python\ndef hello():\n    return 'world'\n```",
    check: (h) => h.includes("hljs-") && h.includes("hljs-keyword"),
  },
  {
    name: "Blockquote with >text (no space) is still parsed",
    md: ">noSpaceBlockquote",
    check: (h) => h.includes("<blockquote>"),
  },
  {
    name: "Table cell alignment attributes present",
    md: "| L | C | R |\n|:--|:-:|--:|\n| a | b | c |",
    check: (h) => h.includes("align=") || h.includes("text-align"),
  },
  {
    name: "No [object Object] in any output",
    md: "```typescript\nconst x = 1;\n```\n\n**bold** and *italic*\n\n- [x] Task",
    check: (h) => !h.includes("[object Object]"),
  },
];

let assertPassed = 0;
let assertFailed = 0;

for (const a of assertions) {
  try {
    const html = await markdownToHtml(a.md);
    const result = a.check(html);
    if (result) {
      console.log(`✅ ${a.name}`);
      assertPassed++;
    } else {
      console.log(`❌ ${a.name}`);
      console.log(`   HTML: ${html.trim().slice(0, 200)}`);
      assertFailed++;
    }
  } catch (err) {
    console.log(`💥 ${a.name} — ${err.message}`);
    assertFailed++;
  }
}

console.log(`\nAssertions: ${assertPassed} passed, ${assertFailed} failed out of ${assertions.length}`);

if (assertFailed === 0 && failed === 0) {
  console.log("\n🎉 All checks passed. markdownToHtml() is migration-ready.\n");
  process.exit(0);
} else {
  console.log("\n⚠  Some checks failed. Review output above.\n");
  process.exit(1);
}
