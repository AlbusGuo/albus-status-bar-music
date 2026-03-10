import { PlaybackMode, PluginSettings } from "../types";

export const DEFAULT_SETTINGS: PluginSettings = {
	musicFolderPath: "",
	favorites: [],
	playbackMode: "loop" as PlaybackMode,
	metadata: {},
	showControlButtons: true,
	closeHubOnClickOutside: false,
	volume: 1,
	enableCustomLyricsColor: false,
	lyricsHighlightColorDark: "",
	lyricsHighlightColorLight: "",
	showLoadNotice: true,
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
