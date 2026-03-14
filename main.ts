import { Notice, Plugin } from 'obsidian';

// 简单判断括号里的内容看起来像不像数学
function looksLikeMath(s: string): boolean {
    if (!s) return false;
    let content = s.trim();

    // 1. 有 LaTeX 命令：\frac, \alpha, \sqrt 等
    if (/\\[a-zA-Z]+/.test(content)) return true;

    // 2. 像 x^2、a_n 这类 x_1 / x^2 的形式
    if (/[a-zA-Z]\s*[_^]\s*[0-9a-zA-Z]/.test(content)) return true;

    // 3. 同时包含数字和运算符（至少有一个数字，且有 + - * / = 之一）
    if (/\d/.test(content) && /[+\-*/=]/.test(content)) return true;

    return false;
}

export default class TransferLatexFromGPTPlugin extends Plugin {
    onload() {
        this.addCommand({
            id: 'convert-latex-to-mathjax',
            name: 'Convert formulas from chatgpt',
            icon: 'sigma',
            callback: () => {
                void this.convertLatexToMathJax();
            }
        });

        this.addRibbonIcon('sigma', 'Convert formulas from chatgpt', () => {
            void this.convertLatexToMathJax();
        });
    }

    onunload() {
    }

    // 读取当前打开的文档内容并进行 LaTeX 到 MathJax 的替换
    async convertLatexToMathJax() {
        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice('No active file found.');
            return;
        }

        // 读取当前文件内容
        const fileContent = await this.app.vault.read(activeFile);

        // 执行 LaTeX 到 MathJax 的替换
        const convertedContent = this.convertLatexSyntax(fileContent);

        // 只有当内容真正发生变化时才写入，避免无意义的修改
        if (convertedContent !== fileContent) {
            await this.app.vault.modify(activeFile, convertedContent);
            new Notice('Formula conversion completed.');
        } else {
            new Notice('No changes needed.');
        }
    }

    // 核心修复逻辑在这里
    convertLatexSyntax(content: string): string {
        let updatedContent = content;

        // === 第 0 步：保护现有的 MathJax 公式 ($$...$$ 和 $...$) ===
        // 我们用一个数组来存储被保护的内容，避免正则误伤
        let protectedMap: { key: string, value: string }[] = [];
        let protectedIndex = 0;

        // 辅助函数：生成唯一的占位符并存储
        function protect(text: string): string {
            // 使用一个极其特殊的字符串作为占位符，防止和原文冲突
            let key = "___EXISTING_MATHJAX_PROTECTED_" + (protectedIndex++) + "___";
            protectedMap.push({ key: key, value: text });
            return key;
        }

        // 1. 先保护块级公式 $$ ... $$ (贪婪匹配)
        updatedContent = updatedContent.replace(/\$\$[\s\S]*?\$\$/g, function(match) {
            return protect(match);
        });

        // 2. 再保护行内公式 $ ... $ 
        // 注意：利用负向预查 (?<!\$) 确保不要匹配到 $$ 的一部分
        updatedContent = updatedContent.replace(/(?<!\$)\$[^$\n]+\$(?!\$)/g, function(match) {
            return protect(match);
        });

        // === 第 1 步：处理 ChatGPT 风格的块级公式 [ ... ] / \[ ... \] ===
        let blockRegex = /\\?\[\s*([\s\S]*?)\s*\\?\]/g;
        // 这里也用临时占位，防止处理行内公式时误伤刚刚生成的块公式
        let newBlocks: { placeholder: string, value: string }[] = [];
        let newBlockIndex = 0;

        updatedContent = updatedContent.replace(blockRegex, function (match, formula) {
            let body = (formula || "").trim();

            // 如果看起来不像数学，就别当公式处理，原样返回
            if (!looksLikeMath(body)) {
                return match;
            }

            let placeholder = "___NEW_LATEX_BLOCK_" + (newBlockIndex++) + "___";
            newBlocks.push({
                placeholder: placeholder,
                value: "$$" + body + "$$"
            });

            return placeholder;
        });

        // === 第 2 步：处理 ChatGPT 风格的行内公式 ( ... ) / \( ... \) ===
        let inlineRegex = /\\?\(\s*([\s\S]*?)\s*\\?\)/g;

        updatedContent = updatedContent.replace(inlineRegex, function (match, formula) {
            let body = (formula || "").trim();

            let hasBackslash = match.startsWith("\\(") || match.endsWith("\\)");

            if (!hasBackslash && !looksLikeMath(body)) {
                return "(" + body + ")";
            }

            return "$" + body + "$";
        });

        // === 第 3 步：把新生成的块公式占位符替换回 $$...$$ ===
        for (let i = 0; i < newBlocks.length; i++) {
            let b = newBlocks[i];
            // 使用 split+join 替换比 replace 更安全（防止 value 中包含特殊字符）
            updatedContent = updatedContent.split(b.placeholder).join(b.value);
        }

        // === 第 4 步：还原最初被保护的现有 MathJax 公式 ===
        for (let i = 0; i < protectedMap.length; i++) {
            let p = protectedMap[i];
            updatedContent = updatedContent.split(p.key).join(p.value);
        }

        return updatedContent;
    }
}