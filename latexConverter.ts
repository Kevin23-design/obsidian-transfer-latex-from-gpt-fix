type ProtectedEntry = {
	key: string;
	value: string;
};

type BlockEntry = {
	placeholder: string;
	value: string;
};

function looksLikeMath(s: string): boolean {
	if (!s) return false;
	const content = s.trim();

	if (/\\[a-zA-Z]+/.test(content)) return true;
	if (/[a-zA-Z]\s*[_^]\s*[0-9a-zA-Z]/.test(content)) return true;
	if (/\d/.test(content) && /[+\-*/=]/.test(content)) return true;

	return false;
}

function looksLikeNonMathParenthetical(s: string): boolean {
	const content = s.trim();

	if (/^\d{4}-\d{2}-\d{2}$/.test(content)) return true;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(content)) return true;
	if (/%[0-9a-f]{2}/i.test(content)) return true;
	if (/[\\/].*\.[a-z0-9]{2,5}($|[?#])/i.test(content)) return true;
	if (/[\\/][a-z0-9._%+-]+[\\/]/i.test(content)) return true;

	return false;
}

function isStandaloneBracketBlock(content: string, offset: number, length: number): boolean {
	const beforeLineBreak = content.lastIndexOf("\n", offset - 1);
	const lineStart = beforeLineBreak === -1 ? 0 : beforeLineBreak + 1;
	const afterLineBreak = content.indexOf("\n", offset + length);
	const lineEnd = afterLineBreak === -1 ? content.length : afterLineBreak;
	const line = content.slice(lineStart, lineEnd);

	return line.trim() === content.slice(offset, offset + length).trim();
}

export function convertLatexSyntax(content: string): string {
	let updatedContent = content;
	const protectedMap: ProtectedEntry[] = [];
	let protectedIndex = 0;

	function protect(text: string): string {
		const key = "___LATEX_CONVERTER_PROTECTED_" + (protectedIndex++) + "___";
		protectedMap.push({ key: key, value: text });
		return key;
	}

	updatedContent = updatedContent.replace(/\$\$[\s\S]*?\$\$/g, function(match) {
		return protect(match);
	});

	updatedContent = updatedContent.replace(/(?<!\$)\$[^$\n]+\$(?!\$)/g, function(match) {
		return protect(match);
	});

	updatedContent = updatedContent.replace(/!{0,2}\[[^\]\n]*\]\([^)\n]*\)/g, function(match) {
		return protect(match);
	});

	updatedContent = updatedContent.replace(/!?\[\[[^\]\n]+\]\]/g, function(match) {
		return protect(match);
	});

	const newBlocks: BlockEntry[] = [];
	let newBlockIndex = 0;
	const blockRegex = /\\\[([\s\S]*?)\\\]|\[([\s\S]*?)\]/g;

	updatedContent = updatedContent.replace(blockRegex, function(match, escapedFormula, plainFormula, offset) {
		const isEscaped = escapedFormula !== undefined;
		const body = (isEscaped ? escapedFormula : plainFormula || "").trim();

		if (!isEscaped && !isStandaloneBracketBlock(updatedContent, offset, match.length)) {
			return match;
		}

		if (!looksLikeMath(body)) {
			return match;
		}

		const placeholder = "___NEW_LATEX_BLOCK_" + (newBlockIndex++) + "___";
		newBlocks.push({
			placeholder: placeholder,
			value: "$$" + body + "$$"
		});

		return placeholder;
	});

	const inlineRegex = /\\\(([\s\S]*?)\\\)|\(([^()\n]*?)\)/g;

	updatedContent = updatedContent.replace(inlineRegex, function(match, escapedFormula, plainFormula) {
		const isEscaped = escapedFormula !== undefined;
		const body = (isEscaped ? escapedFormula : plainFormula || "").trim();

		if (!isEscaped && (!looksLikeMath(body) || looksLikeNonMathParenthetical(body))) {
			return "(" + body + ")";
		}

		return "$" + body + "$";
	});

	for (let i = 0; i < newBlocks.length; i++) {
		const block = newBlocks[i];
		updatedContent = updatedContent.split(block.placeholder).join(block.value);
	}

	for (let i = 0; i < protectedMap.length; i++) {
		const protectedEntry = protectedMap[i];
		updatedContent = updatedContent.split(protectedEntry.key).join(protectedEntry.value);
	}

	return updatedContent;
}
