import { Notice, Plugin } from 'obsidian';
import { convertLatexSyntax } from './latexConverter';

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

	async convertLatexToMathJax() {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice('No active file found.');
			return;
		}

		const fileContent = await this.app.vault.read(activeFile);
		const convertedContent = convertLatexSyntax(fileContent);

		if (convertedContent !== fileContent) {
			await this.app.vault.modify(activeFile, convertedContent);
			new Notice('Formula conversion completed.');
		} else {
			new Notice('No changes needed.');
		}
	}

	// Kept for compatibility with callers that use the plugin instance directly.
	convertLatexSyntax(content: string): string {
		return convertLatexSyntax(content);
	}
}
