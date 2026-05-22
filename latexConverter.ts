type ProtectedEntry = {
	key: string;
	value: string;
};

type ConversionStats = {
	inlineCount: number;
	blockCount: number;
};

function protectWith(map: ProtectedEntry[], prefix: string): (text: string) => string {
	let index = 0;
	return function protect(text: string): string {
		const key = "___" + prefix + "_" + (index++) + "___";
		map.push({ key, value: text });
		return key;
	};
}

function restoreProtected(content: string, map: ProtectedEntry[]): string {
	let restored = content;

	for (let i = 0; i < map.length; i++) {
		const entry = map[i];
		restored = restored.split(entry.key).join(entry.value);
	}

	return restored;
}

function isMathy(s: string): boolean {
	if (/[\\_^→∞±≥≤]|\\text\{/.test(s)) return true;
	if (/\d+\{[,.\s]\}\d+/.test(s)) return true;

	const hasDigit = /\d/.test(s);
	const hasOp = /[+\-*/=<>,]/.test(s);

	if (hasDigit && hasOp) return true;
	if (/^\s*-?\d+(?:\.\d+)?\s*$/.test(s)) return true;
	if (/^[a-zA-Z](?:'+)?$/.test(s.trim())) return true;
	if (/^[A-Z]{2,}(?:'+)?$/.test(s.trim())) return true;
	if (/^[a-zA-Z]\s*[=<>+\-*/]\s*[a-zA-Z]/.test(s)) return true;

	const hasLetters = /[a-zA-Z]/.test(s);
	const hasWords = /\b[a-zA-Z]{2,}\b/.test(s);
	return hasLetters && hasOp && !hasWords;
}

function isNonMathParenthetical(s: string): boolean {
	const content = s.trim();

	if (/^\d{4}-\d{2}-\d{2}$/.test(content)) return true;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(content)) return true;
	if (/%[0-9a-f]{2}/i.test(content)) return true;
	if (/[\\/].*\.[a-z0-9]{2,5}($|[?#])/i.test(content)) return true;
	if (/[\\/][a-z0-9._%+-]+[\\/]/i.test(content)) return true;

	return false;
}

function fixDisplayMathArtifacts(block: string): string {
	return block
		.replace(/(?<!\\)\\[ \t]*$/gm, "\\\\")
		.replace(/(?<!\\)\\(?=[0-9-])/g, "\\\\")
		.replace(/^={3,}$/gm, "=")
		.replace(/^-{3,}$/gm, "-")
		.replace(/^#{1,6}[ \t]+(.*)/gm, "$1\n-")
		.replace(/^([+-]),/gm, "$1");
}

function convertPlainParens(text: string, stats: ConversionStats): string {
	let result = "";
	let i = 0;
	const isWhitespace = (ch: string) => /\s/.test(ch);

	while (i < text.length) {
		const ch = text[i];

		if (ch === "\\" && i + 1 < text.length && text[i + 1] === "(") {
			const end = text.indexOf("\\)", i + 2);
			if (end !== -1) {
				result += text.slice(i, end + 2);
				i = end + 2;
			} else {
				result += ch;
				i += 1;
			}
			continue;
		}

		if (ch !== "(") {
			result += ch;
			i += 1;
			continue;
		}

		const prev = i === 0 ? "" : text[i - 1];
		if (i > 0 && !isWhitespace(prev) && prev !== "(") {
			result += ch;
			i += 1;
			continue;
		}

		let depth = 1;
		let j = i + 1;
		while (j < text.length && depth > 0) {
			const c = text[j];
			if (c === "(") depth += 1;
			else if (c === ")") depth -= 1;
			j += 1;
		}

		if (depth !== 0) {
			result += ch;
			i += 1;
			continue;
		}

		const closeIndex = j - 1;
		const inner = text.slice(i + 1, closeIndex);

		if (/\\\(/.test(inner) || /\\\)/.test(inner)) {
			result += ch;
			i += 1;
			continue;
		}

		let k = closeIndex + 1;
		let primes = "";
		while (k < text.length && text[k] === "'") {
			primes += "'";
			k += 1;
		}

		const after = k < text.length ? text[k] : "";
		const afterIsDelim = after === "" || isWhitespace(after) || ").,;:?!*_".includes(after);
		if (!afterIsDelim) {
			result += ch;
			i += 1;
			continue;
		}

		const innerWithoutCommands = inner.replace(/\\[A-Za-z]+/g, "");
		const hasLaTeXCommand = /\\[a-zA-Z]+/.test(inner);

		if (!hasLaTeXCommand && /\p{Ll}{3,}/u.test(innerWithoutCommands)) {
			result += ch;
			i += 1;
			continue;
		}

		if (isNonMathParenthetical(inner) || !isMathy(inner)) {
			result += ch;
			i += 1;
			continue;
		}

		stats.inlineCount++;
		result += "$" + (inner.trim() + primes) + "$";
		i = k;
	}

	return result;
}

function convertMath(text: string, stats: ConversionStats): string {
	const protectedMap: ProtectedEntry[] = [];
	const protect = protectWith(protectedMap, "LATEX_CONVERTER_PROTECTED");

	text = text.replace(/^([ \t]*)(`{3,}|~{3,})[\s\S]*?\n\1\2[ \t]*$/gm, function(match) {
		return protect(match);
	});

	text = text.replace(/(`+)([^`\n]+)\1/g, function(match) {
		return protect(match);
	});

	text = text.replace(/!{0,2}\[[^\]\n]*\]\([^)\n]*\)/g, function(match) {
		return protect(match);
	});

	text = text.replace(/!?\[\[[^\]\n]+\]\]/g, function(match) {
		return protect(match);
	});

	text = text.replace(/\$\$[\s\S]*?\$\$/g, function(match) {
		return protect(match);
	});

	text = text.replace(/(?<!\$)\$[^$\n]+\$(?!\$)/g, function(match) {
		return protect(match);
	});

	text = text.replace(
		/^>[ \t]*\\\[[ \t]*\r?\n([\s\S]*?)\r?\n>[ \t]*\\\][ \t]*$/gm,
		function(_match, inner: string) {
			const cleaned = inner
				.split(/\r?\n/)
				.map((line: string) => line.replace(/^>[ \t]*/, ""))
				.join(" ");
			stats.blockCount++;
			return "> $$ " + cleaned.trim() + " $$";
		}
	);

	text = text.replace(
		/^>[ \t]*\[[ \t]*\r?\n([\s\S]*?)\r?\n>[ \t]*\][ \t]*$/gm,
		function(_match, inner: string) {
			const cleaned = inner
				.split(/\r?\n/)
				.map((line: string) => line.replace(/^>[ \t]*/, ""))
				.join(" ");
			return "> [ " + cleaned.trim() + " ]";
		}
	);

	text = text.replace(/^#[ \t]*(\[[ \t]*)$/gm, function(_match, bracket: string) {
		return bracket;
	});

	text = text.replace(/^#[ \t]*(\\begin\{)/gm, "$1");

	let out = text.replace(/(^|[^\\])\\\[([\s\S]*?)\\\]/g, function(_match, pre: string, inner: string) {
		stats.blockCount++;
		const trimmed = fixDisplayMathArtifacts(inner.trim());
		if (trimmed.includes("\n")) {
			return pre + "$$\n" + trimmed + "\n$$";
		}
		return pre + "$$" + trimmed + "$$";
	});

	out = out.replace(
		/^[ \t]*([#>\-*+0-9.]+\s*)?\[[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\][ \t]*$/gm,
		function(match, prefix: string | undefined, inner: string) {
			const p = prefix || "";
			if (!isMathy(inner)) return match;
			stats.blockCount++;
			return p + "$$\n" + fixDisplayMathArtifacts(inner.trim()) + "\n$$";
		}
	);

	const bracketParts = out.split(/(\$\$[\s\S]*?\$\$)/);
	out = bracketParts.map(function(part, idx) {
		if (idx % 2 === 1) return part;

		let converted = part.replace(
			/\[\s*\\left\[[^\n]*?\\right\][^\n]*?\]/g,
			function(match, offset: number, fullText: string) {
				const before = fullText.slice(0, offset);
				const afterBracket = fullText[offset + match.length];
				if (afterBracket === "(" || afterBracket === ":") return match;
				if (match.startsWith("[[")) return match;
				const inner = match.slice(1, -1);
				if (inner.startsWith("^")) return match;
				const openInline = (before.match(/\\\(/g) || []).length;
				const closeInline = (before.match(/\\\)/g) || []).length;
				if (openInline > closeInline) return match;
				stats.blockCount++;
				return "$$\n" + inner.trim() + "\n$$";
			}
		);

		converted = converted.replace(
			/\[([^\]]+)\]/g,
			function(match, inner: string, offset: number, fullText: string) {
				const before = fullText.slice(0, offset);
				const afterBracket = fullText[offset + match.length];
				if (afterBracket === "(" || afterBracket === ":") return match;
				if (/\\left\s*$/.test(before) || /\\right/.test(inner) || /\\left/.test(inner)) return match;
				if (match.startsWith("[[")) return match;
				if (inner.startsWith("^")) return match;
				const openInline = (before.match(/\\\(/g) || []).length;
				const closeInline = (before.match(/\\\)/g) || []).length;
				if (openInline > closeInline) return match;
				if (/\\[a-zA-Z]+/.test(inner) || isMathy(inner)) {
					stats.blockCount++;
					const body = fixDisplayMathArtifacts(inner.trim());
					if (body.includes("\n")) return "$$\n" + body + "\n$$";
					return "$$" + body + "$$";
				}
				return match;
			}
		);

		return converted;
	}).join("");

	out = out.replace(/\$\$([\s\S]*?)\$\$/g, function(block: string) {
		return fixDisplayMathArtifacts(block);
	});

	const parts = out.split(/(\$\$[\s\S]*?\$\$)/);
	out = parts.map(function(part, idx) {
		if (idx % 2 === 1 && part.startsWith("$$")) return part;

		let chunk = convertPlainParens(part, stats);
		chunk = chunk.replace(/(^|[^\\])\\\((.+?)\\\)/g, function(_match, pre: string, inner: string) {
			stats.inlineCount++;
			return pre + "$" + inner.trim() + "$";
		});
		return chunk;
	}).join("");

	return restoreProtected(out, protectedMap);
}

export function convertLatexSyntax(content: string): string {
	const stats: ConversionStats = { inlineCount: 0, blockCount: 0 };
	return convertMath(content, stats);
}
