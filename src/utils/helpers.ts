import { PlaybackMode, PluginSettings } from "../types";
import { PLAYBACK_MODES } from "./constants";

export const DEFAULT_SETTINGS: PluginSettings = {
	musicFolderPath: "",
	favorites: [],
	playbackMode: PLAYBACK_MODES[0] as PlaybackMode,
	metadata: {},
};

/**
 * 格式化时间显示 (秒 -> MM:SS)
 */
export function formatTime(seconds: number): string {
	if (!isFinite(seconds) || isNaN(seconds)) {
		return "--:--";
	}
	return new Date(seconds * 1000).toISOString().slice(14, 19);
}

/**
 * 规范化文件路径
 */
export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * 检查文件是否为支持的音频格式
 */
export function isSupportedAudioFile(filename: string): boolean {
	const ext = filename.split(".").pop()?.toLowerCase();
	return ["flac", "mp3", "wav", "m4a", "ogg"].includes(ext || "");
}

/**
 * 限制数值在指定范围内
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * 异步延迟函数
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => void>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null;

	return (...args: Parameters<T>) => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => func(...args), wait);
	};
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => void>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle: boolean = false;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
	return Math.random().toString(36).substr(2, 9);
}

/**
 * 深度复制对象
 */
export function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	if (obj instanceof Date) {
		return new Date(obj.getTime()) as unknown as T;
	}

	if (obj instanceof Array) {
		return obj.map((item) => deepClone(item)) as unknown as T;
	}

	if (typeof obj === "object") {
		const cloned = {} as T;
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				cloned[key] = deepClone(obj[key]);
			}
		}
		return cloned;
	}

	return obj;
}
