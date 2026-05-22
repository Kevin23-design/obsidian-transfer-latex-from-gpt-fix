import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = join(process.cwd(), 'latexConverter.ts');

function loadConverter() {
	if (!existsSync(sourcePath)) {
		throw new Error('latexConverter.ts does not exist');
	}

	const source = readFileSync(sourcePath, 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2019
		}
	}).outputText;

	const module = { exports: {} };
	const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
	fn(module.exports, require, module, sourcePath, process.cwd());
	return module.exports;
}

const { convertLatexSyntax } = loadConverter();

test('keeps Obsidian image embeds with width and encoded paths unchanged', () => {
	const input = '!![|725](assets/Chronos-2%202025/file-20260513222447138.png)';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps Obsidian wiki image embeds unchanged', () => {
	const input = '![[Pasted image 20260519160511.png]]';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps Obsidian wiki image embeds with width unchanged', () => {
	const input = '![[Pasted image 20260519160511.png|725]]';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps Obsidian wiki image embeds with math-like parenthetical filenames unchanged', () => {
	const input = '![[Pasted image (1/2).png]]';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps Markdown images unchanged', () => {
	const input = '![alt](assets/Chronos-2%202025/file.png)';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps Markdown links unchanged', () => {
	const input = '[link](https://example.com/a-1/b.png)';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps Markdown links with math-like labels unchanged', () => {
	const input = '[x^2](https://example.com/math)';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps date-like parenthetical text unchanged', () => {
	const input = '(2026-05-19)';
	assert.equal(convertLatexSyntax(input), input);
});

test('converts escaped inline formulas', () => {
	assert.equal(convertLatexSyntax('\\(x^2 + 1\\)'), '$x^2 + 1$');
});

test('converts escaped block formulas', () => {
	assert.equal(convertLatexSyntax('\\[x^2 + 1\\]'), '$$x^2 + 1$$');
});

test('converts standalone unescaped bracket formulas', () => {
	assert.equal(convertLatexSyntax('[x^2 + 1]'), '$$x^2 + 1$$');
});

test('converts unescaped inline formulas without treating fractions as paths', () => {
	assert.equal(convertLatexSyntax('(1/2)'), '$1/2$');
});

test('keeps existing MathJax unchanged', () => {
	const input = '$x^2 + 1$\n\n$$x^2 + 1$$';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps fenced code blocks unchanged', () => {
	const input = 'Before\n```ts\nconst x = [a+b];\nconst y = (1/2);\n```\nAfter';
	assert.equal(convertLatexSyntax(input), input);
});

test('keeps inline code spans unchanged', () => {
	const input = 'Use `msg[layer_idx]`.';
	assert.equal(convertLatexSyntax(input), input);
});

test('converts quoted escaped block formulas', () => {
	const input = '> \\[\n> x^2 + 1\n> \\]';
	assert.equal(convertLatexSyntax(input), '> $$ x^2 + 1 $$');
});

test('converts multiline bracket blocks that look mathy', () => {
	const input = '[\nx^2 + 1\n]';
	assert.equal(convertLatexSyntax(input), '$$\nx^2 + 1\n$$');
});

test('strips ChatGPT heading artifact before bracket block', () => {
	const input = '# [\nx^2 + 1\n]';
	assert.equal(convertLatexSyntax(input), '$$\nx^2 + 1\n$$');
});

test('strips ChatGPT heading artifact before begin command', () => {
	const input = '# \\begin{pmatrix}\n1 & 2\n\\end{pmatrix}';
	assert.equal(convertLatexSyntax(input), '\\begin{pmatrix}\n1 & 2\n\\end{pmatrix}');
});

test('converts single-line bracket formulas with LaTeX matrix delimiters', () => {
	const input = '[ \\left[ 1 & 2 \\\\ 3 & 4 \\right] ]';
	assert.equal(convertLatexSyntax(input), '$$\n\\left[ 1 & 2 \\\\ 3 & 4 \\right]\n$$');
});

test('converts plain parenthetical single variables and uppercase notation', () => {
	assert.equal(convertLatexSyntax('(p) and (DEM)'), '$p$ and $DEM$');
});

test('does not convert prose parentheticals', () => {
	const input = '(this is prose)';
	assert.equal(convertLatexSyntax(input), input);
});

test('fixes ChatGPT artifacts inside generated display math blocks', () => {
	const input = '\\[\n1 \\\n====\n## x\n+,y\n\\]';
	assert.equal(convertLatexSyntax(input), '$$\n1 \\\\\n=\nx\n-\n+y\n$$');
});
