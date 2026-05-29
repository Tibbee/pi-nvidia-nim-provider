/**
 * Structured logging utility.
 * Replaces console.log statements with namespaced, level-based logging.
 *
 * File logging:
 * - Default file: ~/.pi/nvidia-nim.log
 * - Override path: NVIDIA_NIM_LOG_PATH=/custom/path/nvidia-nim.log
 * - Disable file logging: NVIDIA_NIM_LOG_FILE=false
 */
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	namespace: string;
	message: string;
	data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

// Console default: error-only. Set NVIDIA_NIM_LOG_LEVEL=debug or log_level=info to see more.
const currentLevel: LogLevel = (process.env.NVIDIA_NIM_LOG_LEVEL as LogLevel) || "error";

// File default: debug (so we can inspect full behavior in ~/.pi/nvidia-nim.log).
const fileLevel: LogLevel =
	(process.env.NVIDIA_NIM_FILE_LOG_LEVEL as LogLevel) || "debug";

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

function formatMessage(entry: LogEntry): string {
	let data = "";
	if (entry.data) {
		try {
			data = ` ${JSON.stringify(entry.data)}`;
		} catch {
			data = " [unserializable-data]";
		}
	}
	return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.namespace}] ${entry.message}${data}`;
}

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";
const DEFAULT_LOG_PATH = join(HOME_DIR, ".pi", "nvidia-nim.log");

const LOG_PATH = process.env.NVIDIA_NIM_LOG_PATH || DEFAULT_LOG_PATH;
const FILE_LOG_ENABLED = process.env.NVIDIA_NIM_LOG_FILE !== "false";

function appendToFile(line: string): void {
	if (!FILE_LOG_ENABLED) return;
	try {
		const dir = dirname(LOG_PATH);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		appendFileSync(LOG_PATH, `${line}\n`, "utf8");
	} catch (err) {
		console.error("Failed to write to log file:", err);
	}
}

function log(
	level: LogLevel,
	namespace: string,
	message: string,
	data?: Record<string, unknown>,
): void {
	const logToConsole = shouldLog(level, currentLevel);
	const logToFile = shouldLog(level, fileLevel);
	if (!logToConsole && !logToFile) {
		return;
	}

	const entry: LogEntry = {
		timestamp: new Date().toISOString(),
		level,
		namespace,
		message,
		data,
	};
	const formatted = formatMessage(entry);

	if (logToFile) {
		appendToFile(formatted);
	}
	if (!logToConsole) {
		return;
	}

	switch (level) {
		case "debug":
			console.debug(formatted);
			break;
		case "info":
			console.info(formatted);
			break;
		case "warn":
			console.warn(formatted);
			break;
		case "error":
			console.error(formatted);
			break;
	}
}

export const logger = {
	debug: (namespace: string, message: string, data?: Record<string, unknown>) =>
		log("debug", namespace, message, data),
	info: (namespace: string, message: string, data?: Record<string, unknown>) =>
		log("info", namespace, message, data),
	warn: (namespace: string, message: string, data?: Record<string, unknown>) =>
		log("warn", namespace, message, data),
	error: (namespace: string, message: string, data?: Record<string, unknown>) =>
		log("error", namespace, message, data),
};

export function createLogger(namespace: string) {
	return {
		debug: (message: string, data?: Record<string, unknown>) =>
			logger.debug(namespace, message, data),
		info: (message: string, data?: Record<string, unknown>) =>
			logger.info(namespace, message, data),
		warn: (message: string, data?: Record<string, unknown>) =>
			logger.warn(namespace, message, data),
		error: (message: string, data?: Record<string, unknown>) =>
			logger.error(namespace, message, data),
	};
}
