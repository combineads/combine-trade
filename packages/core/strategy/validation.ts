import ts from "typescript";

export interface ValidationError {
	code: string;
	message: string;
	line?: number;
	column?: number;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

const FORBIDDEN_IDENTIFIERS = new Set([
	"eval",
	"Function",
	"require",
	"import",
	"fetch",
	"XMLHttpRequest",
	"WebSocket",
	"process",
	"global",
	"globalThis",
	"Deno",
	"Bun",
	"__dirname",
	"__filename",
]);

const FORBIDDEN_MODULES = new Set([
	"fs",
	"path",
	"os",
	"net",
	"http",
	"https",
	"child_process",
	"cluster",
	"dgram",
	"dns",
	"tls",
	"vm",
	"worker_threads",
	"crypto",
]);

/**
 * Validate strategy TypeScript code.
 * Static analysis only — no execution.
 */
export function validateStrategyCode(code: string): ValidationResult {
	const errors: ValidationError[] = [];

	// 1. Syntax validation
	const syntaxErrors = checkSyntax(code);
	errors.push(...syntaxErrors);
	if (syntaxErrors.length > 0) {
		return { valid: false, errors };
	}

	// 2. Forbidden API detection
	const forbiddenErrors = detectForbiddenAPIs(code);
	errors.push(...forbiddenErrors);

	return { valid: errors.length === 0, errors };
}

function checkSyntax(code: string): ValidationError[] {
	const sourceFile = ts.createSourceFile("strategy.ts", code, ts.ScriptTarget.Latest, true);
	const errors: ValidationError[] = [];

	// Check for parse errors by looking at diagnostics
	// TypeScript's createSourceFile doesn't throw on errors but creates error nodes
	function visit(node: ts.Node) {
		if (node.kind === ts.SyntaxKind.Unknown) {
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
			errors.push({
				code: "SYNTAX_ERROR",
				message: `Unexpected token at line ${line + 1}`,
				line: line + 1,
				column: character + 1,
			});
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);

	// Also do a quick compile check for syntax-level issues
	const compilerHost = ts.createCompilerHost({});
	const program = ts.createProgram({
		rootNames: ["strategy.ts"],
		options: {
			noEmit: true,
			target: ts.ScriptTarget.Latest,
			module: ts.ModuleKind.ESNext,
			strict: false,
			skipLibCheck: true,
			types: [],
		},
		host: {
			...compilerHost,
			getSourceFile(fileName) {
				if (fileName === "strategy.ts") {
					return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest);
				}
				return undefined;
			},
			fileExists(fileName) {
				return fileName === "strategy.ts";
			},
			readFile(fileName) {
				if (fileName === "strategy.ts") return code;
				return undefined;
			},
			getDefaultLibFileName: () => "lib.d.ts",
			writeFile: () => {},
			getCurrentDirectory: () => "/",
			getCanonicalFileName: (f: string) => f,
			useCaseSensitiveFileNames: () => true,
			getNewLine: () => "\n",
		},
	});

	const syntaxDiags = program.getSyntacticDiagnostics();
	for (const diag of syntaxDiags) {
		if (diag.file && diag.start !== undefined) {
			const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
			errors.push({
				code: "SYNTAX_ERROR",
				message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
				line: line + 1,
				column: character + 1,
			});
		} else {
			errors.push({
				code: "SYNTAX_ERROR",
				message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
			});
		}
	}

	return errors;
}

function detectForbiddenAPIs(code: string): ValidationError[] {
	const sourceFile = ts.createSourceFile("strategy.ts", code, ts.ScriptTarget.Latest, true);
	const errors: ValidationError[] = [];

	function visit(node: ts.Node) {
		// Check identifiers against forbidden list
		if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text)) {
			const parent = node.parent;
			// Skip property access names (obj.eval), property assignments ({ eval: 42 }),
			// and shorthand property assignments
			const isPropertyName =
				(parent && ts.isPropertyAccessExpression(parent) && parent.name === node) ||
				(parent && ts.isPropertyAssignment(parent) && parent.name === node) ||
				(parent && ts.isShorthandPropertyAssignment(parent));
			if (isPropertyName) {
				// This is a property name, not a standalone forbidden identifier — allow
			} else {
				const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
				errors.push({
					code: "FORBIDDEN_API",
					message: `Forbidden API: '${node.text}' is not allowed in strategy code`,
					line: line + 1,
					column: character + 1,
				});
			}
		}

		// Check import declarations
		if (ts.isImportDeclaration(node)) {
			const moduleSpecifier = node.moduleSpecifier;
			if (ts.isStringLiteral(moduleSpecifier)) {
				const moduleName = moduleSpecifier.text;
				if (FORBIDDEN_MODULES.has(moduleName)) {
					const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
					errors.push({
						code: "FORBIDDEN_IMPORT",
						message: `Forbidden import: module '${moduleName}' is not allowed`,
						line: line + 1,
						column: character + 1,
					});
				}
			}
			// Any import is forbidden in sandbox
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
			errors.push({
				code: "FORBIDDEN_IMPORT",
				message: "Import declarations are not allowed in strategy code",
				line: line + 1,
				column: character + 1,
			});
		}

		// Check dynamic import (import())
		if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
			errors.push({
				code: "FORBIDDEN_API",
				message: "Dynamic import() is not allowed in strategy code",
				line: line + 1,
				column: character + 1,
			});
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return errors;
}
